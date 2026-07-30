import json
import logging
from typing import Optional, List, Dict, Any
from groq import AsyncGroq

from app.config import settings
from app.schemas.audit import SessionTimelineResponse, DecisionSummaryResponse

logger = logging.getLogger("audit.summary_generator")


class DecisionSummaryGenerator:
    """
    Uses Groq LLM API (llama-3.3-70b-versatile) to translate technical execution logs
    into clean, customer-friendly plain English audit summaries.
    """

    def __init__(self):
        self.client = None
        if settings.GROQ_API_KEY:
            try:
                self.client = AsyncGroq(api_key=settings.GROQ_API_KEY)
                logger.info("Groq LLM Client initialized successfully.")
            except Exception as e:
                logger.warning(f"Groq Client init warning: {str(e)}")

    async def generate_summary(self, timeline_response: SessionTimelineResponse) -> DecisionSummaryResponse:
        """
        Converts a session timeline into a plain English audit explanation using Groq LLM.
        """
        session = timeline_response.session
        events = timeline_response.timeline

        # Extract tools used and key events
        tools_utilized = list(set([e.tool_name for e in events if e.tool_name]))

        # Prepare log summary payload for Groq
        simplified_steps = []
        for event in events:
            simplified_steps.append({
                "step": event.step_number,
                "type": event.event_type,
                "input": event.user_input,
                "tool": event.tool_name,
                "parameters": event.tool_parameters,
                "response": event.tool_response,
                "reasoning": event.intermediate_reasoning,
                "output": event.final_output,
                "error": event.error_message
            })

        prompt = f"""You are an expert AI Governance Auditor. 
Analyze the following execution logs for an AI Agent named '{session.agent_name}'.
All PII has been redacted.

Goal: Write a clear, customer-friendly explanation in plain simple English explaining:
1. What request was received from the user.
2. What tools/sources the AI agent consulted.
3. What steps and reasoning led to the final outcome.
4. Final decision/outcome summary.

TECHNICAL EXECUTION TIMELINE LOGS:
{json.dumps(simplified_steps, indent=2)}

Respond with a valid JSON object matching this schema:
{{
  "plain_english_summary": "<Paragraph explaining the decision path in simple English>",
  "key_decisions": ["<Bullet 1>", "<Bullet 2>", "<Bullet 3>"],
  "confidence_score": 0.95
}}
"""

        # Call Groq LLM API if key is available
        if self.client and settings.GROQ_API_KEY:
            try:
                response = await self.client.chat.completions.create(
                    model=settings.GROQ_MODEL,
                    messages=[
                        {"role": "system", "content": "You are a professional AI Auditor outputting strictly JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=800
                )
                raw_content = response.choices[0].message.content
                parsed = json.loads(raw_content)

                return DecisionSummaryResponse(
                    session_id=session.session_id,
                    user_id=session.user_id,
                    agent_name=session.agent_name,
                    plain_english_summary=parsed.get("plain_english_summary", "Audit summary generated."),
                    key_decisions=parsed.get("key_decisions", []),
                    tools_utilized=tools_utilized,
                    confidence_score=parsed.get("confidence_score", 0.95),
                    generated_by_llm=f"Groq {settings.GROQ_MODEL}"
                )
            except Exception as e:
                logger.error(f"Groq API call failed or timed out: {str(e)}. Falling back to structured generator.")

        # Fallback Generator when Groq API key is missing or fails
        return self._generate_fallback_summary(session, events, tools_utilized)

    def _generate_fallback_summary(
        self, session: Any, events: List[Any], tools_utilized: List[str]
    ) -> DecisionSummaryResponse:
        """Fallback deterministic summary generator."""
        input_event = next((e for e in events if e.event_type == "USER_INPUT"), None)
        output_event = next((e for e in events if e.event_type == "FINAL_OUTPUT"), None)
        tool_events = [e for e in events if e.event_type == "TOOL_CALL"]

        tool_names_str = ", ".join(tools_utilized) if tools_utilized else "internal rules"
        summary_text = (
            f"The AI Agent '{session.agent_name}' processed a user request with session ID '{session.session_id}'. "
            f"During execution, the agent executed {len(events)} steps, invoking tools ({tool_names_str}) "
            f"to verify details and reach a verified decision. "
            f"All sensitive personal data (PAN, Aadhaar, Email, Phone) was safely redacted before audit log storage."
        )

        decisions = [
            f"Received request: {input_event.user_input if input_event else 'User inquiry'}",
            f"Invoked {len(tool_events)} external tool operations for verification",
            f"Outcome: {output_event.final_output if output_event else 'Execution completed'}"
        ]

        return DecisionSummaryResponse(
            session_id=session.session_id,
            user_id=session.user_id,
            agent_name=session.agent_name,
            plain_english_summary=summary_text,
            key_decisions=decisions,
            tools_utilized=tools_utilized,
            confidence_score=0.90,
            generated_by_llm="Rule-Based Decision Path Auditor (Groq API Key pending)"
        )


summary_generator = DecisionSummaryGenerator()
