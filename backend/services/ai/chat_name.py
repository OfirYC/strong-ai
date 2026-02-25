from bson import ObjectId
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


async def rename_conversation(
    db,
    conversation_id: str,
    first_user_message: str,
):
    """
    Generate short AI title for conversation.
    Non-blocking safe version.
    """

    if not first_user_message:
        return

    from services.ai.openai_client import chat_completion  # your non-stream helper

    try:

        resp = await chat_completion(
            messages=[
                {
                    "role": "system",
                    "content": "Generate a short 3-6 word conversation title. No punctuation. No quotes.",
                },
                {"role": "user", "content": first_user_message},
            ],
            temperature=0.3,
            reasoning="none",
        )

        title = resp.strip().replace('"', "").strip()

        if not title:
            return

        await db.conversations.update_one(
            {"_id": ObjectId(conversation_id)},
            {
                "$set": {
                    "title": title,
                    "updated_at": datetime.utcnow(),
                }
            },
        )

    except Exception as e:
        logger.warning(f"Conversation rename failed: {e}")
