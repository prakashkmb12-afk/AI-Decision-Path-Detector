from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class AgentSimulationRequest(BaseModel):
    user_id: str = Field(..., description="ID of the user running the agent request")
    session_id: Optional[str] = Field(None, description="Optional custom session ID")
    prompt: str = Field(..., description="User request / prompt for the agent (may contain PII)")
    agent_type: str = Field("loan_approval", description="Agent workflow type: 'loan_approval' or 'kyc_verifier'")
    
    # Optional structured financial parameters (if not provided, extracted from prompt text)
    credit_score: Optional[int] = Field(None, description="Explicit credit score (e.g. 598 or 780)")
    annual_income: Optional[float] = Field(None, description="Annual income in INR (e.g. 320000 or 1200000)")
    employment_type: Optional[str] = Field(None, description="Employment type: 'Salaried', 'Self-Employed', 'Contract Employee'")
    loan_amount: Optional[float] = Field(None, description="Requested loan amount in INR (e.g. 3000000)")

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
