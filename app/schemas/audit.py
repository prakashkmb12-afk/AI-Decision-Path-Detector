import uuid
from datetime import datetime
from typing import Optional, List, Any, Dict, Union
from pydantic import BaseModel, ConfigDict, Field, field_serializer


class AuditEventBase(BaseModel):
    step_number: int
    event_type: str
    user_input: Optional[str] = None
    retrieved_context: Optional[str] = None
    tool_name: Optional[str] = None
    tool_parameters: Optional[Dict[str, Any]] = None
    tool_response: Optional[Dict[str, Any]] = None
    intermediate_reasoning: Optional[str] = None
    final_output: Optional[str] = None
    error_message: Optional[str] = None
    execution_time_ms: Optional[float] = None


class AuditEventCreate(AuditEventBase):
    session_id: str


class AuditEventSchema(AuditEventBase):
    id: Union[str, uuid.UUID]
    session_id: str
    created_at: datetime

    @field_serializer('id')
    def serialize_id(self, v: Union[str, uuid.UUID], _info) -> str:
        return str(v)

    model_config = ConfigDict(from_attributes=True)


class AuditSessionBase(BaseModel):
    session_id: str
    user_id: str
    agent_name: str = "DefaultAgent"
    status: str = "COMPLETED"
    metadata_json: Optional[Dict[str, Any]] = Field(default_factory=dict)


class AuditSessionCreate(AuditSessionBase):
    pass


class AuditSessionSchema(AuditSessionBase):
    id: Union[str, uuid.UUID]
    started_at: datetime
    ended_at: Optional[datetime] = None
    summary: Optional[str] = None
    event_count: Optional[int] = 0

    @field_serializer('id')
    def serialize_id(self, v: Union[str, uuid.UUID], _info) -> str:
        return str(v)

    model_config = ConfigDict(from_attributes=True)


class SessionTimelineResponse(BaseModel):
    session: AuditSessionSchema
    timeline: List[AuditEventSchema]
    total_steps: int
    has_pii_redacted: bool = True
    reconstructed_at: datetime


class DecisionSummaryResponse(BaseModel):
    session_id: str
    user_id: str
    agent_name: str
    plain_english_summary: str
    key_decisions: List[str]
    tools_utilized: List[str]
    confidence_score: Optional[float] = 0.95
    generated_by_llm: str = "Groq llama-3.3-70b-versatile"
