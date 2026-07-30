import uuid
import asyncio
from typing import Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.agent import AgentSimulationRequest, AgentSimulationResponse
from app.core.agent_wrapper import InstrumentedAgentWrapper, audit_tool
from app.core.pii_redactor import pii_redactor

router = APIRouter(prefix="/api/v1/agent", tags=["Agent Simulator"])


# --- AUDITED SIMULATOR TOOLS ---
@audit_tool("verify_credit_score")
async def verify_credit_score_tool(wrapper: InstrumentedAgentWrapper, user_id: str, pan_card: str) -> Dict[str, Any]:
    """Simulated credit agency lookup tool."""
    await asyncio.sleep(0.05) # Simulate network latency
    return {
        "credit_score": 780,
        "credit_tier": "EXCELLENT",
        "bureau": "CIBIL",
        "verified_pan": pan_card
    }


@audit_tool("check_account_balance")
async def check_account_balance_tool(wrapper: InstrumentedAgentWrapper, account_no: str) -> Dict[str, Any]:
    """Simulated core banking ledger tool."""
    await asyncio.sleep(0.05)
    return {
        "account_number": account_no,
        "current_balance_inr": 250000.0,
        "monthly_avg_balance_inr": 180000.0,
        "account_status": "ACTIVE"
    }


@audit_tool("evaluate_loan_underwriting")
async def evaluate_loan_underwriting_tool(
    wrapper: InstrumentedAgentWrapper, loan_amount: float, credit_score: int, avg_balance: float
) -> Dict[str, Any]:
    """Simulated underwriting decision engine tool."""
    await asyncio.sleep(0.05)
    is_approved = credit_score >= 700 and avg_balance >= (loan_amount * 0.1)
    return {
        "requested_amount_inr": loan_amount,
        "approved": is_approved,
        "interest_rate_percent": 8.5 if is_approved else None,
        "max_approved_limit_inr": 500000.0 if is_approved else 0.0,
        "risk_grade": "LOW" if is_approved else "HIGH"
    }


@router.post("/simulate", response_model=AgentSimulationResponse, summary="Simulate Instrumented AI Agent Workflow")
async def simulate_agent_execution(
    request: AgentSimulationRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Executes a real end-to-end AI Agent workflow (Loan Approval / KYC Verification)
    instrumented with the PS-7.1 Decision Path Auditor wrapper.
    
    Demonstrates:
    - Pre-storage PII Redaction (PAN, Aadhaar, Email, Phone, Names)
    - Full Trajectory Logging (User Input -> RAG Context -> Tool Calls -> Reasoning -> Output)
    - Persistent DB recording
    """
    session_id = request.session_id or f"sess-{uuid.uuid4().hex[:12]}"
    agent_name = "LoanApprovalAgent" if request.agent_type == "loan_approval" else "KYCVerificationAgent"

    # 1. Instantiate Wrapper
    wrapper = InstrumentedAgentWrapper(
        db_session=db,
        session_id=session_id,
        user_id=request.user_id,
        agent_name=agent_name
    )
    await wrapper.initialize_session(metadata={"source": "api_simulator", "agent_type": request.agent_type})

    # 2. Log Step 1: User Input
    await wrapper.log_user_input(request.prompt)

    # 3. Log Step 2: RAG Context Retrieval
    rag_context = (
        "Underwriting Policy v4.2: Applicants with CIBIL score > 750 eligible for instant pre-approval up to ₹5,00,000. "
        "KYC documents required: PAN Card, Aadhaar Card, and 6 months bank statement."
    )
    await wrapper.log_retrieved_context(rag_context)

    # 4. Log Step 3: Intermediate Reasoning
    await wrapper.log_reasoning(
        "Parsing user prompt for identity & financial details. Extracting PAN card and account details to run CIBIL check."
    )

    if request.simulate_error:
        # Simulate error flow for audit testing
        try:
            raise ValueError("Simulated Core Banking API Timeout (HTTP 504 Gateway Timeout)")
        except Exception as err:
            await wrapper.log_error(err)

        redacted_input, _ = pii_redactor.redact_text(request.prompt)
        return AgentSimulationResponse(
            session_id=session_id,
            user_id=request.user_id,
            agent_name=agent_name,
            status="FAILED",
            user_input_unredacted=request.prompt,
            final_output_redacted="Error occurred: Core Banking API Timeout.",
            total_steps=wrapper.step_counter,
            pii_redacted_count=wrapper.total_pii_redactions,
            reconstructed_timeline_url=f"/api/v1/audit/sessions/{session_id}/timeline"
        )

    # 5. Step 4 & 5: Tool Invocations
    # Tool 1: Credit Score
    credit_res = await verify_credit_score_tool(wrapper, user_id=request.user_id, pan_card="ABCDE1234F")
    
    # Tool 2: Account Balance
    balance_res = await check_account_balance_tool(wrapper, account_no="ACCT-9876543210")

    # Log Reasoning before underwriting
    await wrapper.log_reasoning(
        f"CIBIL score is {credit_res['credit_score']} (EXCELLENT). Monthly average balance is ₹{balance_res['monthly_avg_balance_inr']}. Proceeding to underwriting evaluation."
    )

    # Tool 3: Underwriting
    underwrite_res = await evaluate_loan_underwriting_tool(
        wrapper, loan_amount=300000.0, credit_score=credit_res["credit_score"], avg_balance=balance_res["monthly_avg_balance_inr"]
    )

    # 6. Step 6: Final Output
    final_text = (
        f"Dear Customer, your loan application for ₹3,00,000 has been APPROVED at an interest rate of 8.5% p.a. "
        f"Reference Session ID: {session_id}."
    )
    await wrapper.log_final_output(final_text)

    return AgentSimulationResponse(
        session_id=session_id,
        user_id=request.user_id,
        agent_name=agent_name,
        status="COMPLETED",
        user_input_unredacted=request.prompt,
        final_output_redacted=final_text,
        total_steps=wrapper.step_counter,
        pii_redacted_count=wrapper.total_pii_redactions,
        reconstructed_timeline_url=f"/api/v1/audit/sessions/{session_id}/timeline"
    )
