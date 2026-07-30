from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Path, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete

from app.database import get_db
from app.models.audit import AuditSession
from app.schemas.audit import AuditSessionSchema, SessionTimelineResponse, DecisionSummaryResponse
from app.core.reconstructor import DecisionPathReconstructor
from app.core.summary_generator import summary_generator
from app.core.exceptions import SessionNotFoundException

router = APIRouter(prefix="/api/v1/audit", tags=["Audit Trail"])


@router.get("/sessions", response_model=List[AuditSessionSchema], summary="List & Search Audit Sessions")
async def list_audit_sessions(
    user_id: Optional[str] = Query(None, description="Filter by User ID"),
    status: Optional[str] = Query(None, description="Filter by status (COMPLETED, FAILED, RUNNING)"),
    start_date: Optional[datetime] = Query(None, description="Filter starting from date"),
    end_date: Optional[datetime] = Query(None, description="Filter up to date"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """
    Search audit sessions by User ID, Status, or Date Range.
    """
    reconstructor = DecisionPathReconstructor(db)
    return await reconstructor.list_sessions(
        user_id=user_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset
    )


@router.get("/sessions/{session_id}/timeline", response_model=SessionTimelineResponse, summary="Reconstruct Decision Timeline")
async def get_session_timeline(
    session_id: str = Path(..., description="Unique audit session ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Reconstructs complete chronological step-by-step decision trajectory for a session.
    All inputs, outputs, tool parameters, and responses in the timeline are PII-redacted.
    """
    reconstructor = DecisionPathReconstructor(db)
    try:
        return await reconstructor.reconstruct_timeline(session_id)
    except ValueError as e:
        raise SessionNotFoundException(session_id)


@router.post("/sessions/{session_id}/summary", response_model=DecisionSummaryResponse, summary="Generate Plain English Decision Summary")
async def generate_decision_summary(
    session_id: str = Path(..., description="Unique audit session ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Invokes Groq LLM (llama-3.3-70b-versatile) to translate raw technical execution steps
    into a simple, customer-friendly plain English audit report.
    """
    reconstructor = DecisionPathReconstructor(db)
    try:
        timeline_response = await reconstructor.reconstruct_timeline(session_id)
    except ValueError:
        raise SessionNotFoundException(session_id)

    summary = await summary_generator.generate_summary(timeline_response)

    # Persist summary to session object in DB
    session_obj = await reconstructor.get_session_by_id(session_id)
    if session_obj:
        session_obj.summary = summary.plain_english_summary
        await db.commit()

    return summary


@router.delete("/sessions/{session_id}", summary="Delete Audit Session")
async def delete_audit_session(
    session_id: str = Path(..., description="Unique audit session ID"),
    db: AsyncSession = Depends(get_db)
):
    """Delete an audit session and associated events."""
    reconstructor = DecisionPathReconstructor(db)
    session_obj = await reconstructor.get_session_by_id(session_id)
    if not session_obj:
        raise SessionNotFoundException(session_id)

    await db.delete(session_obj)
    await db.commit()
    return {"message": f"Audit session '{session_id}' deleted successfully."}
