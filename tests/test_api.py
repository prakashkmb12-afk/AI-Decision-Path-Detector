import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check_endpoint(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "degraded"]
    assert "app_name" in data


@pytest.mark.asyncio
async def test_agent_simulate_and_timeline_api(client: AsyncClient):
    # 1. Run agent simulation
    payload = {
        "user_id": "usr_test_999",
        "prompt": "Evaluate loan for Ramesh Kumar, Email: ramesh@test.com, PAN: ABCDE1234F.",
        "agent_type": "loan_approval"
    }
    sim_res = await client.post("/api/v1/agent/simulate", json=payload)
    assert sim_res.status_code == 200
    sim_data = sim_res.json()

    session_id = sim_data["session_id"]
    assert sim_data["status"] == "COMPLETED"
    assert sim_data["total_steps"] > 0

    # 2. Fetch Reconstructed Timeline
    timeline_res = await client.get(f"/api/v1/audit/sessions/{session_id}/timeline")
    assert timeline_res.status_code == 200
    timeline_data = timeline_res.json()

    assert timeline_data["session"]["session_id"] == session_id
    assert len(timeline_data["timeline"]) == sim_data["total_steps"]

    # 3. Generate Summary
    summary_res = await client.post(f"/api/v1/audit/sessions/{session_id}/summary")
    assert summary_res.status_code == 200
    summary_data = summary_res.json()
    assert summary_data["session_id"] == session_id
    assert len(summary_data["plain_english_summary"]) > 0
