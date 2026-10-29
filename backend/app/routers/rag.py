from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.schemas.rag import (
    CodeReviewRequest,
    QuestionsRequest,
    RagResponse,
    SummarizeRequest,
)
from app.services.llm_service import generate_questions, review_code, summarize_topic

router = APIRouter(prefix="/api/rag", tags=["rag"])


@router.post("/summarize", response_model=RagResponse)
async def summarize(
    body: SummarizeRequest,
    _email: str = Depends(get_current_user),
) -> RagResponse:
    result = await summarize_topic(body.topic, body.content)
    return RagResponse(result=result)


@router.post("/questions", response_model=RagResponse)
async def questions(
    body: QuestionsRequest,
    _email: str = Depends(get_current_user),
) -> RagResponse:
    result = await generate_questions(body.topic, body.count)
    return RagResponse(result=result)


@router.post("/code-review", response_model=RagResponse)
async def code_review(
    body: CodeReviewRequest,
    _email: str = Depends(get_current_user),
) -> RagResponse:
    result = await review_code(body.code, body.language)
    return RagResponse(result=result)
