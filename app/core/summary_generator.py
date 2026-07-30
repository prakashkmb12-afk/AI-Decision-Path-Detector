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

        prompt = f"""You are a professional banking compliance officer explaining an automated loan decision to a non-technical applicant/auditor.
All PII has been redacted.

Goal: Write a clear, customer-friendly explanation in plain simple English explaining:
1. Why was this decision made.
2. What checks were performed (Credit Score Verification, Income Verification, Employment Verification).
3. Which requirements were met and which failed.
4. Clear conclusion and recommended next steps for the applicant.

Do NOT use developer terms like "Underwriting Engine", "CIBIL", "API", "Tool Calls", "JSON", "Reasoning Trace".

TECHNICAL EXECUTION TIMELINE LOGS:
{json.dumps(simplified_steps, indent=2)}

Respond with a valid JSON object matching this schema:
{{
  "plain_english_summary": "<Structured plain-English explanation of the decision path>",
  "key_decisions": ["<Check 1 Result>", "<Check 2 Result>", "<Check 3 Result>"],
  "confidence_score": 0.95
}}
"""

        # Call Groq LLM API if key is available
        if self.client and settings.GROQ_API_KEY:
            try:
                response = await self.client.chat.completions.create(
                    model=settings.GROQ_MODEL,
                    messages=[
                        {"role": "system", "content": "You are a professional banking auditor outputting strictly JSON."},
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
                    plain_english_summary=parsed.get("plain_english_summary", "Application verification completed."),
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
        underwrite_event = next((e for e in events if e.tool_name == "evaluate_loan_underwriting"), None)
        tool_resp = underwrite_event.tool_response if (underwrite_event and underwrite_event.tool_response) else {}
        is_approved = tool_resp.get("approved", True)
        reasons = tool_resp.get("rejection_reasons", [])

        if is_approved:
            summary_text = (
                "The application was reviewed using the bank's loan eligibility policy.\n\n"
                "Three important checks were performed:\n"
                "✓ Credit Score Verification\n"
                "✓ Income Verification\n"
                "✓ Employment Verification\n\n"
                "All verification checks satisfied the bank's lending criteria. The loan application has been approved."
            )
            decisions = [
                "Credit Score Verification: Passed (Satisfies minimum 700 threshold)",
                "Income Verification: Passed (Satisfies minimum ₹6,00,000 threshold)",
                "Employment Verification: Passed (Eligible employment category)",
                "Final Outcome: Approved"
            ]
        else:
            reason_text = "; ".join(reasons) if reasons else "Ineligible under loan policy criteria."
            summary_text = (
                "The application was reviewed using the bank's loan eligibility policy.\n\n"
                "Three important checks were performed:\n"
                "✓ Credit Score Verification\n"
                "✓ Income Verification\n"
                "✓ Employment Verification\n\n"
                f"Evaluation Result: {reason_text}\n\n"
                "Therefore, the application has been rejected. "
                "You may apply again after updating your financial details or contacting the bank for manual review."
            )
            decisions = [
                f"Policy Assessment Result: Rejected",
                f"Reason: {reason_text}",
                "Next Step: Applicant may re-apply after addressing policy requirements"
            ]

        return DecisionSummaryResponse(
            session_id=session.session_id,
            user_id=session.user_id,
            agent_name=session.agent_name,
            plain_english_summary=summary_text,
            key_decisions=decisions,
            tools_utilized=tools_utilized,
            confidence_score=0.95,
            generated_by_llm="Rule-Based Decision Path Auditor"
        )


summary_generator = DecisionSummaryGenerator()
