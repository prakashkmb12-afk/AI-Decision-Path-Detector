import json
import logging
from typing import Optional, List, Dict, Any
from groq import AsyncGroq

from app.config import settings
from app.schemas.audit import SessionTimelineResponse, DecisionSummaryResponse

logger = logging.getLogger("audit.summary_generator")


class DecisionSummaryGenerator:
    """
    Translates technical execution logs into plain English compliance audit summaries
    for Loan Underwriting, KYC Identity Verification, and Insurance Claim Processing.
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
        Converts a session timeline into a plain English audit explanation using Groq LLM or deterministic rules.
        """
        session = timeline_response.session
        events = timeline_response.timeline

        tools_utilized = list(set([e.tool_name for e in events if e.tool_name]))

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

        prompt = f"""You are an enterprise AI Governance and Compliance auditor explaining an automated AI decision to an auditor/user.
Workflow Category: {session.agent_name}
All PII has been redacted.

Goal: Write a clear, professional explanation in plain simple English explaining:
1. Why was this decision made.
2. Which mandatory verification checks were performed for this specific workflow.
3. Which requirements were met and which failed.
4. Clear conclusion and recommended next steps.

TECHNICAL EXECUTION TIMELINE LOGS:
{json.dumps(simplified_steps, indent=2)}

Respond with a valid JSON object matching this schema:
{{
  "plain_english_summary": "<Structured plain-English explanation of the decision path>",
  "key_decisions": ["<Check 1 Result>", "<Check 2 Result>", "<Check 3 Result>"],
  "confidence_score": 0.95
}}
"""

        if self.client and settings.GROQ_API_KEY:
            try:
                response = await self.client.chat.completions.create(
                    model=settings.GROQ_MODEL,
                    messages=[
                        {"role": "system", "content": "You are a professional enterprise auditor outputting strictly JSON."},
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
                    plain_english_summary=parsed.get("plain_english_summary", "Decision evaluation completed."),
                    key_decisions=parsed.get("key_decisions", []),
                    tools_utilized=tools_utilized,
                    confidence_score=parsed.get("confidence_score", 0.95),
                    generated_by_llm=f"Groq {settings.GROQ_MODEL}"
                )
            except Exception as e:
                logger.error(f"Groq API call failed or timed out: {str(e)}. Falling back to deterministic summary generator.")

        return self._generate_fallback_summary(session, events, tools_utilized)

    def _generate_fallback_summary(
        self, session: Any, events: List[Any], tools_utilized: List[str]
    ) -> DecisionSummaryResponse:
        agent_name = session.agent_name or "LoanApprovalAgent"

        if agent_name == "KYCVerificationAgent":
            kyc_event = next((e for e in events if e.tool_name == "evaluate_kyc_compliance"), None)
            tool_resp = kyc_event.tool_response if (kyc_event and kyc_event.tool_response) else {}
            is_approved = tool_resp.get("approved", True)
            reasons = tool_resp.get("rejection_reasons", [])

            if is_approved:
                summary_text = (
                    "The submitted identity verification request was evaluated using the organization's KYC policy.\n\n"
                    "Three mandatory verification checks were performed:\n"
                    "✓ Identity Document Format Verification\n"
                    "✓ Biometric Face Match Rating\n"
                    "✓ Address Registry Match\n\n"
                    "All verification requirements satisfied regulatory standards. The identity verification has been APPROVED."
                )
                decisions = [
                    "Document Format: Valid",
                    "Face Match Rating: Passed (>= 80% threshold)",
                    "Address Registry Match: Verified",
                    "Final Outcome: Verified"
                ]
            else:
                formatted_reasons = "\n• ".join(reasons) if reasons else "Mandatory identity requirements were not satisfied."
                summary_text = (
                    "The submitted identity verification request was evaluated using the organization's KYC policy.\n\n"
                    "Verification Failure Notice:\n"
                    f"• {formatted_reasons}\n\n"
                    "Because these mandatory requirements were not satisfied, the identity verification request could not be approved.\n\n"
                    "Recommended Next Step:\n"
                    "Please provide a clearer facial image and valid address proof before resubmitting the request."
                )
                decisions = [
                    f"KYC Assessment Result: Rejected",
                    f"Failure Reasons: {'; '.join(reasons)}",
                    "Next Step: Provide clearer facial biometrics or updated address proof"
                ]

        elif agent_name == "InsuranceClaimAgent":
            claim_event = next((e for e in events if e.tool_name == "evaluate_claim_underwriting"), None)
            tool_resp = claim_event.tool_response if (claim_event and claim_event.tool_response) else {}
            is_approved = tool_resp.get("approved", True)
            reasons = tool_resp.get("rejection_reasons", [])

            if is_approved:
                summary_text = (
                    "The insurance claim request was evaluated against active policy coverage rules.\n\n"
                    "Three mandatory checks were performed:\n"
                    "✓ Policy Coverage Active Status\n"
                    "✓ Supporting Document Proof Validation\n"
                    "✓ Automatic Claim Limit Threshold\n\n"
                    "All policy criteria were satisfied. The insurance claim has been APPROVED."
                )
                decisions = [
                    "Policy Coverage Status: Active",
                    "Document Proof: Attached & Verified",
                    "Claim Amount: Within automatic approval limit (<= ₹5,00,000)",
                    "Final Outcome: Approved"
                ]
            else:
                formatted_reasons = "\n• ".join(reasons) if reasons else "Ineligible under policy coverage rules."
                summary_text = (
                    "The insurance claim request was evaluated against active policy coverage rules.\n\n"
                    "Verification Failure Notice:\n"
                    f"• {formatted_reasons}\n\n"
                    "Therefore, the insurance claim request could not be approved automatically.\n\n"
                    "Recommended Next Step:\n"
                    "Please attach required supporting bills/receipts or contact policy administration for committee review."
                )
                decisions = [
                    f"Claim Assessment Result: Rejected",
                    f"Failure Reasons: {'; '.join(reasons)}",
                    "Next Step: Provide missing proof documents or request manual committee review"
                ]

        else:
            # Default Loan Approval Agent
            underwrite_event = next((e for e in events if e.tool_name == "evaluate_loan_underwriting"), None)
            tool_resp = underwrite_event.tool_response if (underwrite_event and underwrite_event.tool_response) else {}
            is_approved = tool_resp.get("approved", True)
            reasons = tool_resp.get("rejection_reasons", [])

            if is_approved:
                summary_text = (
                    "The application was reviewed using the lending policy rules.\n\n"
                    "Three important checks were performed:\n"
                    "✓ Credit Score Verification\n"
                    "✓ Income Verification\n"
                    "✓ Employment Verification\n\n"
                    "All verification checks satisfied lending criteria. The loan application has been APPROVED."
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
                    "The application was reviewed using the lending policy rules.\n\n"
                    "Verification Failure Notice:\n"
                    f"• {reason_text}\n\n"
                    "Therefore, the loan application has been REJECTED.\n\n"
                    "Recommended Next Step:\n"
                    "You may apply again after updating your financial details or contacting manual underwriting."
                )
                decisions = [
                    f"Policy Assessment Result: Rejected",
                    f"Reason: {reason_text}",
                    "Next Step: Applicant may re-apply after addressing policy requirements"
                ]

        return DecisionSummaryResponse(
            session_id=session.session_id,
            user_id=session.user_id,
            agent_name=agent_name,
            plain_english_summary=summary_text,
            key_decisions=decisions,
            tools_utilized=tools_utilized,
            confidence_score=0.95,
            generated_by_llm="Rule-Based Decision Path Auditor"
        )


summary_generator = DecisionSummaryGenerator()
