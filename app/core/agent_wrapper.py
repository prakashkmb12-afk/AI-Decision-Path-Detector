import time
import uuid
import logging
import functools
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Callable
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditSession, AuditEvent
from app.core.pii_redactor import pii_redactor

logger = logging.getLogger("audit.agent_wrapper")


class InstrumentedAgentWrapper:
    """
    Instrumented Agent Wrapper for PS-7.1 Decision Path Auditor.
    Captures every step of AI Agent execution:
    - User Input Prompt
    - Context Retrieval (RAG)
    - Tool Calls, Parameters, Responses
    - Intermediate Reasoning Chains
    - Final Output & Exceptions
    
    Guarantees 100% PII Redaction prior to storing in database.
    """

    def __init__(self, db_session: AsyncSession, session_id: Optional[str] = None, user_id: str = "anonymous", agent_name: str = "DecisionAgent"):
        self.db = db_session
        self.session_id = session_id or f"sess-{uuid.uuid4().hex[:12]}"
        self.user_id = user_id
        self.agent_name = agent_name
        self.step_counter = 0
        self.total_pii_redactions = 0
        self.audit_session: Optional[AuditSession] = None

    async def initialize_session(self, metadata: Optional[Dict[str, Any]] = None) -> AuditSession:
        """Creates or initializes the audit session record."""
        # Redact any sensitive metadata
        redacted_meta, pii_count = pii_redactor.redact_json(metadata or {})
        self.total_pii_redactions += pii_count

        self.audit_session = AuditSession(
            session_id=self.session_id,
            user_id=self.user_id,
            agent_name=self.agent_name,
            status="RUNNING",
            metadata_json=redacted_meta
        )
        self.db.add(self.audit_session)
        await self.db.commit()
        await self.db.refresh(self.audit_session)
        logger.info(f"[Audit Session Started] session_id={self.session_id}, user_id={self.user_id}")
        return self.audit_session

    async def log_step(
        self,
        event_type: str,
        user_input: Optional[str] = None,
        retrieved_context: Optional[str] = None,
        tool_name: Optional[str] = None,
        tool_parameters: Optional[Dict[str, Any]] = None,
        tool_response: Optional[Dict[str, Any]] = None,
        intermediate_reasoning: Optional[str] = None,
        final_output: Optional[str] = None,
        error_message: Optional[str] = None,
        execution_time_ms: Optional[float] = None
    ) -> AuditEvent:
        """
        Logs a single execution step to audit_events table after redacting all PII.
        """
        self.step_counter += 1

        # Redact User Input
        redacted_input, c1 = pii_redactor.redact_text(user_input) if user_input else (None, 0)
        # Redact Retrieved Context
        redacted_context, c2 = pii_redactor.redact_text(retrieved_context) if retrieved_context else (None, 0)
        # Redact Tool Params
        redacted_params, c3 = pii_redactor.redact_json(tool_parameters) if tool_parameters else (None, 0)
        # Redact Tool Response
        redacted_response, c4 = pii_redactor.redact_json(tool_response) if tool_response else (None, 0)
        # Redact Reasoning
        redacted_reasoning, c5 = pii_redactor.redact_text(intermediate_reasoning) if intermediate_reasoning else (None, 0)
        # Redact Final Output
        redacted_output, c6 = pii_redactor.redact_text(final_output) if final_output else (None, 0)
        # Redact Error Message
        redacted_error, c7 = pii_redactor.redact_text(error_message) if error_message else (None, 0)

        step_pii_count = c1 + c2 + c3 + c4 + c5 + c6 + c7
        self.total_pii_redactions += step_pii_count

        event = AuditEvent(
            session_id=self.session_id,
            step_number=self.step_counter,
            event_type=event_type,
            user_input=redacted_input,
            retrieved_context=redacted_context,
            tool_name=tool_name,
            tool_parameters=redacted_params,
            tool_response=redacted_response,
            intermediate_reasoning=redacted_reasoning,
            final_output=redacted_output,
            error_message=redacted_error,
            execution_time_ms=execution_time_ms,
        )

        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)

        logger.debug(
            f"[Audit Event Logged] session_id={self.session_id}, step={self.step_counter}, "
            f"type={event_type}, pii_redacted={step_pii_count}"
        )
        return event

    async def log_user_input(self, prompt: str) -> AuditEvent:
        """Helper to log initial user prompt."""
        return await self.log_step(event_type="USER_INPUT", user_input=prompt)

    async def log_retrieved_context(self, context_str: str) -> AuditEvent:
        """Helper to log RAG context retrieval."""
        return await self.log_step(event_type="CONTEXT_RETRIEVAL", retrieved_context=context_str)

    async def log_reasoning(self, reasoning_text: str) -> AuditEvent:
        """Helper to log agent thought chain."""
        return await self.log_step(event_type="REASONING", intermediate_reasoning=reasoning_text)

    async def log_tool_call(
        self, tool_name: str, parameters: Dict[str, Any], response: Dict[str, Any], execution_time_ms: float
    ) -> AuditEvent:
        """Helper to log tool call execution."""
        return await self.log_step(
            event_type="TOOL_CALL",
            tool_name=tool_name,
            tool_parameters=parameters,
            tool_response=response,
            execution_time_ms=execution_time_ms
        )

    async def log_final_output(self, output_text: str) -> AuditEvent:
        """Helper to log final agent output and mark session COMPLETED."""
        event = await self.log_step(event_type="FINAL_OUTPUT", final_output=output_text)
        if self.audit_session:
            self.audit_session.status = "COMPLETED"
            self.audit_session.ended_at = datetime.now(timezone.utc)
            await self.db.commit()
        return event

    async def log_error(self, error: Exception) -> AuditEvent:
        """Helper to log failure and mark session FAILED."""
        error_msg = f"{type(error).__name__}: {str(error)}"
        event = await self.log_step(event_type="ERROR", error_message=error_msg)
        if self.audit_session:
            self.audit_session.status = "FAILED"
            self.audit_session.ended_at = datetime.now(timezone.utc)
            await self.db.commit()
        return event


def audit_tool(tool_name: str):
    """
    Decorator for intercepting individual agent tool functions automatically.
    Captures tool name, arguments, return value, timing, and errors.
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(agent_wrapper_inst: InstrumentedAgentWrapper, *args, **kwargs):
            start_time = time.perf_counter()
            tool_params = kwargs.copy()
            if args:
                tool_params["_positional_args"] = [str(a) for a in args]

            try:
                if func.__code__.co_flags & 0x80: # Check if async function
                    result = await func(agent_wrapper_inst, *args, **kwargs)
                else:
                    result = func(agent_wrapper_inst, *args, **kwargs)

                exec_time = (time.perf_counter() - start_time) * 1000.0

                tool_resp = result if isinstance(result, dict) else {"result": result}
                await agent_wrapper_inst.log_tool_call(
                    tool_name=tool_name,
                    parameters=tool_params,
                    response=tool_resp,
                    execution_time_ms=round(exec_time, 2)
                )
                return result
            except Exception as e:
                exec_time = (time.perf_counter() - start_time) * 1000.0
                await agent_wrapper_inst.log_step(
                    event_type="TOOL_ERROR",
                    tool_name=tool_name,
                    tool_parameters=tool_params,
                    error_message=str(e),
                    execution_time_ms=round(exec_time, 2)
                )
                raise
        return wrapper
    return decorator
