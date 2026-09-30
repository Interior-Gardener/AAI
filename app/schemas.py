"""Request bodies for the JSON endpoints (validated automatically by FastAPI/Pydantic)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ExplainRequest(BaseModel):
    image_id: str = Field(..., min_length=8, max_length=64)
    text: str = Field(..., min_length=1, max_length=300, description="Caption to ground in the image")


class VQARequest(BaseModel):
    image_id: str = Field(..., min_length=8, max_length=64)
    question: str = Field(..., min_length=1, max_length=200)


class MatchRequest(BaseModel):
    image_id: str = Field(..., min_length=8, max_length=64)
    texts: list[str] = Field(..., min_length=1, max_length=8, description="Descriptions to score against the image")
