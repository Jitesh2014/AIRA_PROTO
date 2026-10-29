from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.llm_service import chat_reply

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def send_message(
    body: ChatRequest,
    _email: str = Depends(get_current_user),
) -> ChatResponse:
    reply = await chat_reply(body.message, body.mode)
    return ChatResponse(reply=reply, mode=body.mode)
