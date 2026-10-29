from pydantic import BaseModel, Field


class SummarizeRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=4000)
    content: str | None = None


class QuestionsRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=4000)
    count: int = Field(default=5, ge=1, le=20)


class CodeReviewRequest(BaseModel):
    code: str = Field(min_length=1, max_length=20000)
    language: str | None = None


class RagResponse(BaseModel):
    result: str
