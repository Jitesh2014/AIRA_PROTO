from openai import OpenAI

from app.config import settings


def _client() -> OpenAI | None:
    if not settings.openai_api_key:
        return None
    return OpenAI(api_key=settings.openai_api_key)


def _mock_reply(prompt: str, task: str) -> str:
    return (
        f"**AIRA ({task})**\n\n"
        f"I received your request. Connect an `OPENAI_API_KEY` in `backend/.env` "
        f"for live AI responses.\n\n"
        f"**Your input (preview):**\n{prompt[:500]}"
        f"{'...' if len(prompt) > 500 else ''}"
    )


async def generate_text(system: str, user: str, task: str) -> str:
    client = _client()
    if client is None:
        return _mock_reply(user, task)

    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.4,
    )
    return response.choices[0].message.content or ""


async def chat_reply(message: str, mode: str | None = None) -> str:
    system = (
        "You are AIRA, a helpful AI assistant for research, summarization, "
        "question generation, and code review. Be clear and concise."
    )
    if mode:
        system += f" Current task mode: {mode}."
    return await generate_text(system, message, "Chat")


async def summarize_topic(topic: str, content: str | None = None) -> str:
    user = f"Topic/chapter: {topic}"
    if content:
        user += f"\n\nContent:\n{content}"
    system = (
        "Summarize the given topic or chapter clearly with key points, "
        "definitions, and takeaways."
    )
    return await generate_text(system, user, "Summarization")


async def generate_questions(topic: str, count: int) -> str:
    system = (
        f"Generate {count} study or review questions for the given topic. "
        "Include a mix of difficulty levels."
    )
    return await generate_text(system, f"Topic: {topic}", "Question Generation")


async def review_code(code: str, language: str | None = None) -> str:
    lang = language or "auto-detect"
    system = (
        "Review the code for bugs, security issues, performance, and style. "
        "Provide actionable suggestions."
    )
    user = f"Language: {lang}\n\n```\n{code}\n```"
    return await generate_text(system, user, "Code Review")
