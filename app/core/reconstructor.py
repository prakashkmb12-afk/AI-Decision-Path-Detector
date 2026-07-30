import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.audit import AuditSession, AuditEvent
from app.schemas.audit import SessionTimelineResponse, AuditSessionSchema, AuditEventSchema

logger = logging.getLogger("audit.reconstructor")


class DecisionPathReconstructor:
    """
    Reconstructs complete chronological AI decision timelines from raw audit logs.
    Supports filtering by Session ID, User ID, and Date Ranges.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_session_by_id(self, session_id: str) -> Optional[AuditSession]:
        """Fetch session metadata by session ID."""
        stmt = (
            select(AuditSession)
            .where(AuditSession.session_id == session_id)
            .options(selectinload(AuditSession.events))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_sessions(
        self,
        user_id: Optional[str] = None,
        status: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[AuditSessionSchema]:
        """
        Search and filter audit sessions by User ID, Status, and Date Range.
        """
        conditions = []
        if user_id:
            conditions.append(AuditSession.user_id == user_id)
        if status:
            conditions.append(AuditSession.status == status)
        if start_date:
            conditions.append(AuditSession.started_at >= start_date)
        if end_date:
            conditions.append(AuditSession.started_at <= end_date)

        stmt = select(AuditSession)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        
        stmt = (
            stmt.order_by(AuditSession.started_at.desc())
            .limit(limit)
            .offset(offset)
            .options(selectinload(AuditSession.events))
        )

        result = await self.db.execute(stmt)
        sessions = result.scalars().all()

        response_list = []
        for sess in sessions:
            schema_data = AuditSessionSchema.model_validate(sess)
            schema_data.event_count = len(sess.events)
            response_list.append(schema_data)

        return response_list

    async def reconstruct_timeline(self, session_id: str) -> SessionTimelineResponse:
        """
        Reconstructs step-by-step decision trajectory timeline for a given session.
        Returns SessionTimelineResponse schema.
        """
        session_obj = await self.get_session_by_id(session_id)
        if not session_obj:
            raise ValueError(f"Audit session '{session_id}' not found.")

        # Order events explicitly by step_number
        events_stmt = (
            select(AuditEvent)
            .where(AuditEvent.session_id == session_id)
            .order_by(AuditEvent.step_number.asc())
        )
        events_result = await self.db.execute(events_stmt)
        events = events_result.scalars().all()

        timeline_schemas = [AuditEventSchema.model_validate(e) for e in events]
        session_schema = AuditSessionSchema.model_validate(session_obj)
        session_schema.event_count = len(timeline_schemas)

        return SessionTimelineResponse(
            session=session_schema,
            timeline=timeline_schemas,
            total_steps=len(timeline_schemas),
            has_pii_redacted=True,
            reconstructed_at=datetime.now()
        )
