import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.agent_wrapper import InstrumentedAgentWrapper, audit_tool


@pytest.mark.asyncio
async def test_agent_wrapper_logging(db_session: AsyncSession):
    wrapper = InstrumentedAgentWrapper(db_session, session_id="test-sess-001", user_id="usr-123")
    await wrapper.initialize_session()

    # Log Prompt with PII
    e1 = await wrapper.log_user_input("My email is alice@gmail.com and PAN is ABCDE1234F.")
    assert "[EMAIL_REDACTED]" in e1.user_input
    assert "[PAN_REDACTED]" in e1.user_input

    # Log Final Output
    e2 = await wrapper.log_final_output("Loan approved successfully.")
    assert e2.final_output == "Loan approved successfully."

    assert wrapper.step_counter == 2
    assert wrapper.audit_session.status == "COMPLETED"


@pytest.mark.asyncio
async def test_audit_tool_decorator(db_session: AsyncSession):
    wrapper = InstrumentedAgentWrapper(db_session, session_id="test-sess-002", user_id="usr-456")
    await wrapper.initialize_session()

    @audit_tool("test_calculator")
    async def sample_tool(w: InstrumentedAgentWrapper, x: int, y: int):
        return {"sum": x + y}

    res = await sample_tool(wrapper, x=10, y=20)
    assert res["sum"] == 30
    assert wrapper.step_counter == 1
