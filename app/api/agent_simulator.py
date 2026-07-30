import uuid
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.agent import AgentSimulationRequest, AgentSimulationResponse
from app.core.agent_wrapper import InstrumentedAgentWrapper
from app.core.pii_redactor import pii_redactor
from app.core.workflow_engines import WORKFLOW_REGISTRY, LoanUnderwritingEngine

logger = logging.getLogger("audit.agent_simulator")
router = APIRouter(prefix="/api/v1/agent", tags=["Agent Simulator"])


@router.post("/simulate", response_model=AgentSimulationResponse, summary="Simulate Instrumented AI Agent Workflow")
async def simulate_agent_execution(
    request: AgentSimulationRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Executes an instrumented production AI Agent workflow (Loan Underwriting / KYC / Insurance)
    using the PS-7.1 Decision Path Auditor wrapper.
    Delegates to the registered strategy engine matching request.agent_type.
    """
    logger.info(f"[REQUEST RECEIVED] User ID: {request.user_id} | Agent Type: {request.agent_type}")

    if not request.prompt or not request.prompt.strip():
        logger.warning("[VALIDATION FAILED] Prompt payload is empty")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request prompt payload cannot be empty. Please provide decision evaluation details."
        )

    session_id = request.session_id or f"sess-{uuid.uuid4().hex[:12]}"
    agent_type = request.agent_type or "loan_approval"
    
    agent_name_map = {
        "loan_approval": "LoanApprovalAgent",
        "kyc_verification": "KYCVerificationAgent",
        "insurance_claim": "InsuranceClaimAgent"
    }
    
    if agent_type not in WORKFLOW_REGISTRY:
        logger.warning(f"[WORKFLOW NOT FOUND] Selected agent_type '{agent_type}' is not registered")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow strategy '{agent_type}' is currently unavailable or not registered."
        )

    agent_name = agent_name_map.get(agent_type, "GenericDecisionAgent")
    logger.info(f"[WORKFLOW SELECTED] Engine: {agent_name} | Session ID: {session_id}")

    try:
        # 1. Instantiate Wrapper
        wrapper = InstrumentedAgentWrapper(
            db_session=db,
            session_id=session_id,
            user_id=request.user_id,
            agent_name=agent_name
        )
        await wrapper.initialize_session(metadata={"source": "api_simulator", "agent_type": agent_type})
        logger.info(f"[AUDIT SESSION CREATED] Session initialized in database: {session_id}")

        # 2. Log Step 1: User Input
        await wrapper.log_user_input(request.prompt)

        # 3. Simulate Error Testing Mode if requested
        if request.simulate_error:
            logger.info("[ERROR SIMULATION] Simulating intentional workflow failure for audit testing")
            try:
                raise ValueError("Simulated Workflow Interruption for Audit Testing")
            except Exception as err:
                await wrapper.log_error(err)

            return AgentSimulationResponse(
                session_id=session_id,
                user_id=request.user_id,
                agent_name=agent_name,
                status="FAILED",
                user_input_unredacted=request.prompt,
                final_output_redacted="Decision evaluation service temporarily interrupted.",
                total_steps=wrapper.step_counter,
                pii_redacted_count=wrapper.total_pii_redactions,
                reconstructed_timeline_url=f"/api/v1/audit/sessions/{session_id}/timeline"
            )

        # 4. Delegate Execution to Strategy Engine
        logger.info(f"[DECISION ENGINE STARTED] Executing strategy engine for {agent_name}")
        engine = WORKFLOW_REGISTRY.get(agent_type, LoanUnderwritingEngine())
        exec_res = await engine.execute(
            wrapper=wrapper,
            prompt=request.prompt,
            request_data=request.model_dump()
        )

        logger.info(f"[DECISION COMPLETED] Outcome: {exec_res.get('approved')} | Session ID: {session_id}")

        return AgentSimulationResponse(
            session_id=session_id,
            user_id=request.user_id,
            agent_name=agent_name,
            status="COMPLETED",
            user_input_unredacted=request.prompt,
            final_output_redacted=exec_res.get("final_output", "Completed."),
            total_steps=wrapper.step_counter,
            pii_redacted_count=wrapper.total_pii_redactions,
            reconstructed_timeline_url=f"/api/v1/audit/sessions/{session_id}/timeline"
        )

    except Exception as exc:
        logger.error(f"[INTERNAL ERROR] Execution failed for Session {session_id}: {str(exc)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal decision evaluation processing error: {str(exc)}"
        )
