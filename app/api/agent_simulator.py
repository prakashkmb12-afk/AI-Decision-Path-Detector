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

from app.core.workflow_engines import WORKFLOW_REGISTRY, LoanUnderwritingEngine

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
    session_id = request.session_id or f"sess-{uuid.uuid4().hex[:12]}"
    agent_type = request.agent_type or "loan_approval"
    
    agent_name_map = {
        "loan_approval": "LoanApprovalAgent",
        "kyc_verification": "KYCVerificationAgent",
        "insurance_claim": "InsuranceClaimAgent"
    }
    agent_name = agent_name_map.get(agent_type, "GenericDecisionAgent")

    # Instantiate Wrapper
    wrapper = InstrumentedAgentWrapper(
        db_session=db,
        session_id=session_id,
        user_id=request.user_id,
        agent_name=agent_name
    )
    await wrapper.initialize_session(metadata={"source": "api_simulator", "agent_type": agent_type})

    # Log Step 1: User Input
    await wrapper.log_user_input(request.prompt)

    if request.simulate_error:
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

    # Delegate to Workflow Strategy Engine
    engine = WORKFLOW_REGISTRY.get(agent_type, LoanUnderwritingEngine())
    exec_res = await engine.execute(
        wrapper=wrapper,
        prompt=request.prompt,
        request_data=request.model_dump()
    )

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
