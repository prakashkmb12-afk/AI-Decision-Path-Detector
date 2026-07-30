from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class AgentSimulationRequest(BaseModel):
    user_id: str = Field(..., description="ID of the user running the agent request")
    session_id: Optional[str] = Field(None, description="Optional custom session ID")
    prompt: str = Field(..., description="User request / prompt for the agent (may contain PII)")
    agent_type: str = Field("loan_approval", description="Agent workflow type: 'loan_approval', 'customer_support', or 'kyc_verifier'")
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
