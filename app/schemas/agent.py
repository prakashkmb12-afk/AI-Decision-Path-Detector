from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class AgentSimulationRequest(BaseModel):
    user_id: str = Field(..., description="ID of the user running the agent request")
    session_id: Optional[str] = Field(None, description="Optional custom session ID")
    prompt: str = Field(..., description="User request / prompt for the agent (may contain PII)")
    agent_type: str = Field("loan_approval", description="Agent workflow type: 'loan_approval' or 'kyc_verifier'")
    
    # Optional structured parameters for Loan Underwriting
    credit_score: Optional[int] = Field(None, description="Explicit credit score (e.g. 598 or 780)")
    annual_income: Optional[float] = Field(None, description="Annual income in INR (e.g. 320000 or 1200000)")
    employment_type: Optional[str] = Field(None, description="Employment type: 'Salaried', 'Self-Employed', 'Contract Employee'")
    loan_amount: Optional[float] = Field(None, description="Requested loan amount in INR (e.g. 3000000)")

    # Optional structured parameters for KYC Verification
    document_type: Optional[str] = Field(None, description="ID Document Type (e.g. PAN Card, Passport)")
    document_number: Optional[str] = Field(None, description="ID Document Number")
    face_match_score: Optional[float] = Field(None, description="Face match rating % (e.g. 95)")
    address_status: Optional[str] = Field(None, description="Address verification status: 'Verified' or 'Mismatch'")

    # Optional structured parameters for Insurance Claim Processing
    policy_number: Optional[str] = Field(None, description="Policy number")
    claim_category: Optional[str] = Field(None, description="Claim Category: Health, Vehicle, Property")
    claim_amount: Optional[float] = Field(None, description="Claim amount in INR")
    proof_attached: Optional[str] = Field(None, description="Document proof attached: 'Yes' or 'No'")

    simulate_error: bool = Field(False, description="Whether to simulate a tool/workflow failure for error audit testing")


class AgentSimulationResponse(BaseModel):
    session_id: str
    user_id: str
    agent_name: str
    status: str
    user_input_unredacted: str
    final_output_redacted: str
    total_steps: int
    pii_redacted_count: int
    reconstructed_timeline_url: str
