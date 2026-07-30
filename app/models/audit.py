import uuid
from datetime import datetime, timezone
from typing import Optional, Any, Dict, List
from sqlalchemy import String, DateTime, Text, Float, Integer, ForeignKey, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AuditSession(Base):
    """
    Represents an audited AI agent session execution.
    Tracks session-level metadata, user ID, status, and start/end timestamps.
    """
    __tablename__ = "audit_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    agent_name: Mapped[str] = mapped_column(String(100), nullable=False, default="DefaultAgent")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="COMPLETED") # RUNNING, COMPLETED, FAILED
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True, nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, nullable=True)

    # Relationship to events
    events: Mapped[List["AuditEvent"]] = relationship(
        "AuditEvent",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="AuditEvent.step_number"
    )

    __table_args__ = (
        Index("idx_audit_session_user_date", "user_id", "started_at"),
    )


class AuditEvent(Base):
    """
    Represents an individual step in the AI decision path.
    Types include: USER_INPUT, CONTEXT_RETRIEVAL, REASONING, TOOL_CALL, FINAL_OUTPUT, ERROR.
    All string & JSON fields MUST be PII redacted prior to creation.
    """
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("audit_sessions.session_id", ondelete="CASCADE"), index=True, nullable=False
    )
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    
    user_input: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retrieved_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tool_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tool_parameters: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    tool_response: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    intermediate_reasoning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    final_output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    execution_time_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True, nullable=False)

    # Relationship back to session
    session: Mapped["AuditSession"] = relationship("AuditSession", back_populates="events")

    __table_args__ = (
        Index("idx_audit_event_session_step", "session_id", "step_number"),
    )
