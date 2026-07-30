import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List

from app.core.agent_wrapper import InstrumentedAgentWrapper, audit_tool
from app.core.pii_redactor import pii_redactor

logger = logging.getLogger("audit.workflow_engines")


# =====================================================================
# AUDITED WORKFLOW TOOLS FOR LOAN UNDERWRITING
# =====================================================================
@audit_tool("verify_credit_score")
async def verify_credit_score_tool(wrapper: InstrumentedAgentWrapper, user_id: str, pan_card: str, credit_score: int) -> Dict[str, Any]:
    await asyncio.sleep(0.05)
    return {
        "credit_score": credit_score,
        "verified_pan": pan_card,
        "minimum_threshold_required": 700,
        "is_score_eligible": credit_score >= 700
    }


@audit_tool("check_account_balance")
async def check_account_balance_tool(wrapper: InstrumentedAgentWrapper, account_no: str, annual_income: float) -> Dict[str, Any]:
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
    await asyncio.sleep(0.05)
    rejection_reasons = []

    if credit_score < 700:
        rejection_reasons.append(f"Credit score ({credit_score}) is below required minimum threshold of 700")

    if annual_income < 600000.0:
        rejection_reasons.append(f"Annual income (₹{annual_income:,.2f}) is below minimum requirement of ₹6,00,000")

    if employment_type.strip().lower() == "contract employee":
        rejection_reasons.append("Employment category 'Contract Employee' is ineligible under lending policy")

    max_eligible_loan = annual_income * 5.0
    if loan_amount > max_eligible_loan:
        rejection_reasons.append(f"Requested loan amount (₹{loan_amount:,.2f}) exceeds eligible limit of 5x annual income (₹{max_eligible_loan:,.2f})")

    is_approved = len(rejection_reasons) == 0

    return {
        "requested_amount_inr": loan_amount,
        "annual_income_inr": annual_income,
        "credit_score": credit_score,
        "employment_type": employment_type,
        "approved": is_approved,
        "decision": "APPROVED" if is_approved else "REJECTED",
        "rejection_reasons": rejection_reasons,
        "max_approved_limit_inr": max_eligible_loan if is_approved else 0.0,
        "risk_grade": "LOW" if is_approved else "HIGH"
    }


# =====================================================================
# AUDITED WORKFLOW TOOLS FOR KYC IDENTITY VERIFICATION
# =====================================================================
@audit_tool("verify_identity_document")
async def verify_identity_document_tool(wrapper: InstrumentedAgentWrapper, doc_type: str, doc_number: str) -> Dict[str, Any]:
    await asyncio.sleep(0.05)
    is_valid = len(doc_number) >= 5
    return {
        "document_type": doc_type,
        "document_number": doc_number,
        "document_status": "VALID" if is_valid else "INVALID",
        "registry_verified": is_valid
    }


@audit_tool("evaluate_face_biometrics")
async def evaluate_face_biometrics_tool(wrapper: InstrumentedAgentWrapper, match_score: float) -> Dict[str, Any]:
    await asyncio.sleep(0.05)
    is_pass = match_score >= 90.0
    return {
        "face_match_score_percent": match_score,
        "required_threshold_percent": 90.0,
        "biometric_status": "MATCH" if is_pass else "MISMATCH"
    }


@audit_tool("verify_address_registry")
async def verify_address_registry_tool(wrapper: InstrumentedAgentWrapper, address_status: str) -> Dict[str, Any]:
    await asyncio.sleep(0.05)
    is_verified = address_status.strip().lower() in ["verified", "matched", "match"]
    return {
        "address_verification_status": "VERIFIED" if is_verified else "MISMATCH",
        "registry_match": is_verified
    }


@audit_tool("evaluate_kyc_compliance")
async def evaluate_kyc_compliance_tool(
    wrapper: InstrumentedAgentWrapper,
    doc_valid: bool,
    face_pass: bool,
    address_verified: bool,
    doc_type: str,
    match_score: float,
    address_status: str
) -> Dict[str, Any]:
    await asyncio.sleep(0.05)
    rejection_reasons = []

    if not doc_valid:
        rejection_reasons.append("Identity document number format is invalid")

    if not face_pass:
        rejection_reasons.append(f"Face match rating ({match_score}%) is below required minimum threshold of 90%")

    if not address_verified:
        rejection_reasons.append(f"Address verification status ({address_status}) indicates address mismatch")

    is_approved = len(rejection_reasons) == 0

    return {
        "document_type": doc_type,
        "face_match_score_percent": match_score,
        "address_status": address_status,
        "approved": is_approved,
        "decision": "VERIFIED" if is_approved else "REJECTED",
        "rejection_reasons": rejection_reasons
    }


# =====================================================================
# AUDITED WORKFLOW TOOLS FOR INSURANCE CLAIM PROCESSING
# =====================================================================
@audit_tool("verify_policy_status")
async def verify_policy_status_tool(wrapper: InstrumentedAgentWrapper, policy_number: str, category: str) -> Dict[str, Any]:
    await asyncio.sleep(0.05)
    is_active = len(policy_number) >= 3
    return {
        "policy_number": policy_number,
        "claim_category": category,
        "policy_status": "ACTIVE" if is_active else "EXPIRED",
        "coverage_valid": is_active
    }


@audit_tool("validate_claim_documents")
async def validate_claim_documents_tool(wrapper: InstrumentedAgentWrapper, proof_attached: str) -> Dict[str, Any]:
    await asyncio.sleep(0.05)
    has_proof = proof_attached.strip().lower() in ["yes", "true", "verified", "attached"]
    return {
        "document_proof_attached": "ATTACHED" if has_proof else "MISSING",
        "proof_verified": has_proof
    }


@audit_tool("evaluate_claim_underwriting")
async def evaluate_claim_underwriting_tool(
    wrapper: InstrumentedAgentWrapper,
    policy_active: bool,
    has_proof: bool,
    claim_amount: float,
    policy_number: str,
    category: str
) -> Dict[str, Any]:
    await asyncio.sleep(0.05)
    rejection_reasons = []

    if not policy_active:
        rejection_reasons.append("Policy number is expired or inactive")

    if not has_proof:
        rejection_reasons.append("Required supporting document proof is missing")

    if claim_amount > 500000.0:
        rejection_reasons.append(f"Claim amount (₹{claim_amount:,.2f}) exceeds automatic approval threshold of ₹5,00,000")

    is_approved = len(rejection_reasons) == 0

    return {
        "policy_number": policy_number,
        "claim_category": category,
        "claim_amount_inr": claim_amount,
        "approved": is_approved,
        "decision": "APPROVED" if is_approved else "REJECTED",
        "rejection_reasons": rejection_reasons
    }


# =====================================================================
# ABSTRACT BASE WORKFLOW ENGINE
# =====================================================================
class BaseWorkflowEngine(ABC):
    @abstractmethod
    async def execute(
        self,
        wrapper: InstrumentedAgentWrapper,
        prompt: str,
        request_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        pass


# =====================================================================
# 1. LOAN UNDERWRITING STRATEGY ENGINE
# =====================================================================
class LoanUnderwritingEngine(BaseWorkflowEngine):
    async def execute(
        self,
        wrapper: InstrumentedAgentWrapper,
        prompt: str,
        request_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        credit_score = request_data.get("credit_score", 750)
        annual_income = request_data.get("annual_income", 1200000.0)
        employment_type = request_data.get("employment_type", "Salaried")
        loan_amount = request_data.get("loan_amount", 500000.0)
        pan_card = request_data.get("pan_card", "ABCDE1234F")
        account_no = request_data.get("account_no", "5432109876543")

        # Step 2: Context Retrieval
        rag_context = (
            "Bank Lending Policy Rules: "
            "1. Minimum Credit Score: 700. "
            "2. Minimum Annual Income: ₹6,00,000. "
            "3. Employment Eligibility: Salaried or Self-Employed (Contract Employee ineligible). "
            "4. Max Loan Limit: 5x Annual Income."
        )
        await wrapper.log_retrieved_context(rag_context)

        # Step 3: Reasoning
        await wrapper.log_reasoning(
            "Application Assessment: The system analyzed the applicant's financial details and compared them with the loan eligibility policy."
        )

        # Tool 1 & Tool 2 Execution
        credit_res = await verify_credit_score_tool(wrapper, user_id=wrapper.user_id, pan_card=pan_card, credit_score=credit_score)
        balance_res = await check_account_balance_tool(wrapper, account_no=account_no, annual_income=annual_income)

        # Intermediate Reasoning
        await wrapper.log_reasoning(
            "The application met initial credit and banking verification steps and is now being evaluated for the final decision."
        )

        # Tool 3 Execution
        underwrite_res = await evaluate_loan_underwriting_tool(
            wrapper,
            credit_score=credit_score,
            annual_income=annual_income,
            employment_type=employment_type,
            loan_amount=loan_amount
        )

        # Final Output
        if underwrite_res["approved"]:
            final_text = f"Loan Application Approved: Your requested loan of ₹{loan_amount:,.2f} satisfies all credit score, income, and employment policy requirements."
        else:
            reasons_formatted = "; ".join(underwrite_res["rejection_reasons"])
            final_text = f"Loan Application Rejected: Your requested loan of ₹{loan_amount:,.2f} could not be approved at this time. Reason(s): {reasons_formatted}."

        await wrapper.log_final_output(final_text)
        return {"approved": underwrite_res["approved"], "final_output": final_text}


# =====================================================================
# 2. KYC IDENTITY VERIFICATION STRATEGY ENGINE
# =====================================================================
class KYCVerificationEngine(BaseWorkflowEngine):
    async def execute(
        self,
        wrapper: InstrumentedAgentWrapper,
        prompt: str,
        request_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        doc_type = request_data.get("document_type", "PAN Card")
        doc_number = request_data.get("document_number", "ABCDE1234F")
        match_score = float(request_data.get("face_match_score", 95.0))
        address_status = request_data.get("address_status", "Verified")

        # Step 2: Context Retrieval
        rag_context = (
            "KYC Regulatory Verification Rules: "
            "1. Valid Government Identity Document (PAN, Aadhaar, Passport, Driving License). "
            "2. Minimum Face Match Biometric Rating: 90%. "
            "3. Address Verification Status: Verified Match (Mismatch ineligible)."
        )
        await wrapper.log_retrieved_context(rag_context)

        # Step 3: Reasoning
        await wrapper.log_reasoning(
            "Identity Assessment: The system extracted the identity document and biometric parameters to evaluate KYC compliance."
        )

        # Tool 1, 2, 3 Execution
        doc_res = await verify_identity_document_tool(wrapper, doc_type=doc_type, doc_number=doc_number)
        face_res = await evaluate_face_biometrics_tool(wrapper, match_score=match_score)
        addr_res = await verify_address_registry_tool(wrapper, address_status=address_status)

        # Intermediate Reasoning
        await wrapper.log_reasoning(
            "The subject's document format, facial biometrics, and address registry match ratings have been verified against KYC regulations."
        )

        # Tool 4 Execution
        kyc_res = await evaluate_kyc_compliance_tool(
            wrapper,
            doc_valid=doc_res["registry_verified"],
            face_pass=face_res["biometric_status"] == "MATCH",
            address_verified=addr_res["registry_match"],
            doc_type=doc_type,
            match_score=match_score,
            address_status=address_status
        )

        # Final Output
        if kyc_res["approved"]:
            final_text = f"KYC Verification Approved: Identity document ({doc_type}), biometric face match ({match_score}%), and address registry status satisfy all regulatory requirements."
        else:
            reasons_formatted = "; ".join(kyc_res["rejection_reasons"])
            final_text = f"KYC Verification Rejected: Identity verification could not be completed. Reason(s): {reasons_formatted}."

        await wrapper.log_final_output(final_text)
        return {"approved": kyc_res["approved"], "final_output": final_text}


# =====================================================================
# 3. INSURANCE CLAIM PROCESSING STRATEGY ENGINE
# =====================================================================
class InsuranceClaimEngine(BaseWorkflowEngine):
    async def execute(
        self,
        wrapper: InstrumentedAgentWrapper,
        prompt: str,
        request_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        policy_number = request_data.get("policy_number", "POL-9876543")
        category = request_data.get("claim_category", "Health")
        claim_amount = float(request_data.get("claim_amount", 150000.0))
        proof_attached = request_data.get("proof_attached", "Yes")

        # Step 2: Context Retrieval
        rag_context = (
            "Insurance Underwriting Policy Rules: "
            "1. Policy Status: Active & Valid Coverage. "
            "2. Supporting Document Proof: Required (Missing proof ineligible). "
            "3. Maximum Automatic Approval Limit: ₹5,00,000."
        )
        await wrapper.log_retrieved_context(rag_context)

        # Step 3: Reasoning
        await wrapper.log_reasoning(
            "Claim Assessment: The system retrieved policy coverage details and verified attached supporting documents."
        )

        # Tool 1 & 2 Execution
        policy_res = await verify_policy_status_tool(wrapper, policy_number=policy_number, category=category)
        doc_res = await validate_claim_documents_tool(wrapper, proof_attached=proof_attached)

        # Intermediate Reasoning
        await wrapper.log_reasoning(
            "Policy status and document proof attachments were validated against insurance policy thresholds."
        )

        # Tool 3 Execution
        claim_res = await evaluate_claim_underwriting_tool(
            wrapper,
            policy_active=policy_res["coverage_valid"],
            has_proof=doc_res["proof_verified"],
            claim_amount=claim_amount,
            policy_number=policy_number,
            category=category
        )

        # Final Output
        if claim_res["approved"]:
            final_text = f"Insurance Claim Approved: Your claim of ₹{claim_amount:,.2f} under Policy {policy_number} ({category}) satisfies all policy coverage and document requirements."
        else:
            reasons_formatted = "; ".join(claim_res["rejection_reasons"])
            final_text = f"Insurance Claim Rejected: Claim of ₹{claim_amount:,.2f} under Policy {policy_number} could not be approved automatically. Reason(s): {reasons_formatted}."

        await wrapper.log_final_output(final_text)
        return {"approved": claim_res["approved"], "final_output": final_text}


# =====================================================================
# WORKFLOW STRATEGY REGISTRY
# =====================================================================
WORKFLOW_REGISTRY: Dict[str, BaseWorkflowEngine] = {
    "loan_approval": LoanUnderwritingEngine(),
    "kyc_verification": KYCVerificationEngine(),
    "insurance_claim": InsuranceClaimEngine()
}
