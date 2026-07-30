import re
import uuid
import asyncio
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.agent import AgentSimulationRequest, AgentSimulationResponse
from app.core.agent_wrapper import InstrumentedAgentWrapper, audit_tool
from app.core.pii_redactor import pii_redactor

router = APIRouter(prefix="/api/v1/agent", tags=["Agent Simulator"])


def extract_financial_details(
    prompt: str,
    req_credit: Optional[int] = None,
    req_income: Optional[float] = None,
    req_emp: Optional[str] = None,
    req_amount: Optional[float] = None
) -> Dict[str, Any]:
    """
    Parses dynamic financial details from prompt or explicit request fields.
    """
    # 1. Credit Score Extraction
    credit_score = req_credit
    if credit_score is None:
        cs_match = re.search(r'(?:credit score|cibil|score)[:\s]*(\d{3})', prompt, re.IGNORECASE)
        if cs_match:
            credit_score = int(cs_match.group(1))
        else:
            digits = re.findall(r'\b([3-8]\d{2}|900)\b', prompt)
            credit_score = int(digits[0]) if digits else 750

    # 2. Annual Income Extraction
    annual_income = req_income
    if annual_income is None:
        inc_match = re.search(r'(?:annual income|income|salary)[:\s]*[₹\s]*([0-9,]+)', prompt, re.IGNORECASE)
        if inc_match:
            annual_income = float(inc_match.group(1).replace(',', ''))
        else:
            annual_income = 800000.0

    # 3. Employment Type Extraction
    employment_type = req_emp
    if not employment_type:
        if re.search(r'contract', prompt, re.IGNORECASE):
            employment_type = "Contract Employee"
        elif re.search(r'self[-\s]?employed|business', prompt, re.IGNORECASE):
            employment_type = "Self-Employed"
        else:
            employment_type = "Salaried"

    # 4. Loan Amount Extraction
    loan_amount = req_amount
    if loan_amount is None:
        amt_match = re.search(r'(?:loan amount|amount|requested)[:\s]*[₹\s]*([0-9,]+)', prompt, re.IGNORECASE)
        if amt_match:
            loan_amount = float(amt_match.group(1).replace(',', ''))
        else:
            loan_amount = 300000.0

    # PAN Card extraction
    pan_match = re.search(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b', prompt)
    pan_card = pan_match.group(0) if pan_match else "ABCDE1234F"

    # Account Number extraction
    acc_match = re.search(r'\b\d{10,16}\b', prompt)
    account_no = acc_match.group(0) if acc_match else "9876543210"

    return {
        "credit_score": credit_score,
        "annual_income": annual_income,
        "employment_type": employment_type,
        "loan_amount": loan_amount,
        "pan_card": pan_card,
        "account_no": account_no
    }


# --- AUDITED REAL DYNAMIC TOOLS ---
@audit_tool("verify_credit_score")
async def verify_credit_score_tool(wrapper: InstrumentedAgentWrapper, user_id: str, pan_card: str, credit_score: int) -> Dict[str, Any]:
    """Credit agency lookup tool evaluating dynamic credit score."""
    await asyncio.sleep(0.05)
    tier = "EXCELLENT" if credit_score >= 750 else ("GOOD" if credit_score >= 700 else "POOR")
    return {
        "credit_score": credit_score,
        "credit_tier": tier,
        "bureau": "CIBIL",
        "verified_pan": pan_card,
        "minimum_threshold_required": 700,
        "is_score_eligible": credit_score >= 700
    }


@audit_tool("check_account_balance")
async def check_account_balance_tool(wrapper: InstrumentedAgentWrapper, account_no: str, annual_income: float) -> Dict[str, Any]:
    """Core banking ledger tool evaluating dynamic account balance."""
    await asyncio.sleep(0.05)
    estimated_monthly_balance = round(annual_income / 12.0 * 0.65, 2)
    return {
        "account_number": account_no,
        "annual_income_inr": annual_income,
        "monthly_avg_balance_inr": estimated_monthly_balance,
        "account_status": "ACTIVE"
    }


@audit_tool("evaluate_loan_underwriting")
async def evaluate_loan_underwriting_tool(
    wrapper: InstrumentedAgentWrapper,
    credit_score: int,
    annual_income: float,
    employment_type: str,
    loan_amount: float
) -> Dict[str, Any]:
    """
    Dynamic Underwriting Decision Engine evaluating real policy rules:
    - Rule 1: Credit Score >= 700
    - Rule 2: Annual Income >= ₹6,00,000
    - Rule 3: Employment Type != 'Contract Employee'
    - Rule 4: Loan Amount <= 5x Annual Income
    """
    await asyncio.sleep(0.05)
    rejection_reasons = []

    if credit_score < 700:
        rejection_reasons.append(f"CIBIL credit score ({credit_score}) is below required minimum of 700")

    if annual_income < 600000.0:
        rejection_reasons.append(f"Annual income (₹{annual_income:,.2f}) is below minimum requirement of ₹6,00,000")

    if employment_type.strip().lower() == "contract employee":
        rejection_reasons.append("Employment type 'Contract Employee' is ineligible under underwriting policy")

    max_eligible_loan = annual_income * 5.0
    if loan_amount > max_eligible_loan:
        rejection_reasons.append(f"Requested loan (₹{loan_amount:,.2f}) exceeds max eligible limit of 5x income (₹{max_eligible_loan:,.2f})")

    is_approved = len(rejection_reasons) == 0

    return {
        "requested_amount_inr": loan_amount,
        "annual_income_inr": annual_income,
        "credit_score": credit_score,
        "employment_type": employment_type,
        "approved": is_approved,
        "decision": "APPROVED" if is_approved else "REJECTED",
        "rejection_reasons": rejection_reasons,
        "interest_rate_percent": 8.5 if is_approved else None,
        "max_approved_limit_inr": max_eligible_loan if is_approved else 0.0,
        "risk_grade": "LOW" if is_approved else "HIGH"
    }


@router.post("/simulate", response_model=AgentSimulationResponse, summary="Simulate Instrumented AI Agent Workflow")
async def simulate_agent_execution(
    request: AgentSimulationRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Executes a production AI Agent workflow (Loan Approval / KYC Verification)
    instrumented with the PS-7.1 Decision Path Auditor wrapper.
    
    Evaluates real underwriting policy rules against extracted dynamic user parameters.
    """
    session_id = request.session_id or f"sess-{uuid.uuid4().hex[:12]}"
    agent_name = "LoanApprovalAgent" if request.agent_type == "loan_approval" else "KYCVerificationAgent"

    # 1. Parse Dynamic Financial Input
    financials = extract_financial_details(
        prompt=request.prompt,
        req_credit=request.credit_score,
        req_income=request.annual_income,
        req_emp=request.employment_type,
        req_amount=request.loan_amount
    )

    credit_score = financials["credit_score"]
    annual_income = financials["annual_income"]
    employment_type = financials["employment_type"]
    loan_amount = financials["loan_amount"]
    pan_card = financials["pan_card"]
    account_no = financials["account_no"]

    # 2. Instantiate Wrapper
    wrapper = InstrumentedAgentWrapper(
        db_session=db,
        session_id=session_id,
        user_id=request.user_id,
        agent_name=agent_name
    )
    await wrapper.initialize_session(metadata={"source": "api_simulator", "agent_type": request.agent_type})

    # 3. Log Step 1: User Input
    await wrapper.log_user_input(request.prompt)

    # 4. Log Step 2: RAG Context Retrieval
    rag_context = (
        "Underwriting Policy v4.2 Rules: "
        "1. Minimum CIBIL score: 700. "
        "2. Minimum Annual Income: ₹6,00,000. "
        "3. Employment Eligibility: Salaried or Self-Employed (Contract Employee ineligible). "
        "4. Max Loan Limit: 5x Annual Income."
    )
    await wrapper.log_retrieved_context(rag_context)

    # 5. Log Step 3: Intermediate Reasoning
    await wrapper.log_reasoning(
        f"Parsing user request for financial parameters. Extracted: Credit Score={credit_score}, "
        f"Annual Income=₹{annual_income:,.2f}, Employment='{employment_type}', Requested Loan=₹{loan_amount:,.2f}."
    )

    if request.simulate_error:
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

    # 6. Tool Calls with Real Extracted Data
    # Tool 1: Credit Score Lookup
    credit_res = await verify_credit_score_tool(wrapper, user_id=request.user_id, pan_card=pan_card, credit_score=credit_score)
    
    # Tool 2: Account Balance Verification
    balance_res = await check_account_balance_tool(wrapper, account_no=account_no, annual_income=annual_income)

    # Intermediate Reasoning before Underwriting
    status_str = "Eligible score" if credit_res["is_score_eligible"] else "Ineligible score (<700)"
    await wrapper.log_reasoning(
        f"CIBIL score verified as {credit_score} ({credit_res['credit_tier']} - {status_str}). "
        f"Monthly avg balance estimated at ₹{balance_res['monthly_avg_balance_inr']:,.2f}. "
        f"Employment: '{employment_type}'. Proceeding to Policy Underwriting Engine."
    )

    # Tool 3: Underwriting Decision Engine Evaluation
    underwrite_res = await evaluate_loan_underwriting_tool(
        wrapper,
        credit_score=credit_score,
        annual_income=annual_income,
        employment_type=employment_type,
        loan_amount=loan_amount
    )

    # 7. Final Output Formulation
    if underwrite_res["approved"]:
        final_text = (
            f"Dear Customer, your loan application for ₹{loan_amount:,.2f} has been APPROVED at an interest rate of 8.5% p.a. "
            f"Reference Session ID: {session_id}."
        )
    else:
        reasons_formatted = "; ".join(underwrite_res["rejection_reasons"])
        final_text = (
            f"Dear Customer, your loan application for ₹{loan_amount:,.2f} has been REJECTED based on Underwriting Policy criteria. "
            f"Reason(s): {reasons_formatted}. Reference Session ID: {session_id}."
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
