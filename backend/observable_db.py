# observable_db.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional
from bson import ObjectId


# -----------------------
# Entity config (paste)
# -----------------------


@dataclass(frozen=True)
class EntityConfig:
    entity: str
    owner_field: Optional[
        str
    ]  # field on doc that identifies owner user_id; None => use wrapper user_id
    scope: str  # "user" | "mixed"
    emit: bool = True


ENTITY_CONFIG: Dict[str, EntityConfig] = {
    # AUTH / PROFILE
    "users": EntityConfig(entity="user", owner_field="_id", scope="user", emit=True),
    "profiles": EntityConfig(
        entity="profile", owner_field="user_id", scope="user", emit=True
    ),
    "profile_insights": EntityConfig(
        entity="profile_insights", owner_field="user_id", scope="user", emit=True
    ),
    # CORE
    "exercises": EntityConfig(
        entity="exercise", owner_field="user_id", scope="mixed", emit=True
    ),
    "templates": EntityConfig(
        entity="template", owner_field="user_id", scope="user", emit=True
    ),
    "planned_workouts": EntityConfig(
        entity="planned_workout", owner_field="user_id", scope="user", emit=True
    ),
    "workouts": EntityConfig(
        entity="workout_session", owner_field="user_id", scope="user", emit=True
    ),
    "prs": EntityConfig(
        entity="pr_record", owner_field="user_id", scope="user", emit=True
    ),
    # AI
    "conversations": EntityConfig(
        entity="conversation", owner_field="user_id", scope="user", emit=True
    ),
    "chat_messages": EntityConfig(
        entity="chat_message",
        owner_field="user_id",
        scope="user",
        emit=True,
    ),
    "ai_jobs": EntityConfig(
        entity="ai_job", owner_field="user_id", scope="user", emit=False
    ),
}


def _to_str_id(v: Any) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)


# -----------------------
# Observable wrappers
# -----------------------


class ObservableCollection:
    """
    Wraps a Motor collection.
    - READ methods pass-through
    - WRITE methods emit db_change events
    """

    def __init__(
        self,
        collection,
        *,
        user_id: str,
        emit: Callable[[str, dict], Any],
        config: EntityConfig,
    ):
        self._col = collection
        self._user_id = user_id
        self._emit = emit
        self._cfg = config

    # ---------- READS (pass-through) ----------
    def find(self, *args, **kwargs):
        return self._col.find(*args, **kwargs)

    def find_one(self, *args, **kwargs):
        return self._col.find_one(*args, **kwargs)

    def aggregate(self, *args, **kwargs):
        return self._col.aggregate(*args, **kwargs)

    def distinct(self, *args, **kwargs):
        return self._col.distinct(*args, **kwargs)

    # ---------- WRITES (intercept) ----------
    async def insert_one(self, doc: dict):
        res = await self._col.insert_one(doc)
        full = await self._col.find_one({"_id": res.inserted_id})
        await self._emit_upsert(
            full, fallback_user_id=self._user_id, inserted_id=res.inserted_id
        )
        return res

    async def update_one(self, *args, **kwargs):
        """
        update_one(filter, update, ...)
        """
        res = await self._col.update_one(*args, **kwargs)
        if res.matched_count:
            # If filter is not unique, find_one(filter) is "best effort".
            filt = args[0] if args else kwargs.get("filter") or kwargs.get("spec") or {}
            doc = await self._col.find_one(filt)
            await self._emit_upsert(doc, fallback_user_id=self._user_id)
        return res

    async def replace_one(self, *args, **kwargs):
        """
        replace_one(filter, replacement, ...)
        """
        res = await self._col.replace_one(*args, **kwargs)
        if res.matched_count:
            filt = args[0] if args else kwargs.get("filter") or kwargs.get("spec") or {}
            doc = await self._col.find_one(filt)
            await self._emit_upsert(doc, fallback_user_id=self._user_id)
        return res

    async def delete_one(self, filter: dict):
        doc = await self._col.find_one(filter)
        res = await self._col.delete_one(filter)
        await self._emit_delete(doc, fallback_user_id=self._user_id)
        return res

    # ---------- helpers ----------
    async def _emit_upsert(
        self, doc: Optional[dict], *, fallback_user_id: str, inserted_id: Any = None
    ):
        if not self._cfg.emit:
            return
        if not doc:
            # if we inserted but failed to re-fetch, at least emit id
            if inserted_id is None:
                return
            await self._emit(
                fallback_user_id,
                {
                    "type": "db_change",
                    "entity": self._cfg.entity,
                    "action": "upsert",
                    "id": _to_str_id(inserted_id),
                    "payload": None,
                },
            )
            return

        recipient_user_id = self._resolve_recipient_user_id(
            doc, fallback_user_id=fallback_user_id
        )
        if recipient_user_id is None:
            # mixed/global doc and you don't want to broadcast to everyone
            return

        await self._emit(
            recipient_user_id,
            {
                "type": "db_change",
                "entity": self._cfg.entity,
                "action": "upsert",
                "id": _to_str_id(doc.get("_id")),
                "payload": self._serialize(doc),
            },
        )

    async def _emit_delete(self, doc: Optional[dict], *, fallback_user_id: str):
        if not self._cfg.emit:
            return
        if not doc:
            return

        recipient_user_id = self._resolve_recipient_user_id(
            doc, fallback_user_id=fallback_user_id
        )
        if recipient_user_id is None:
            return

        await self._emit(
            recipient_user_id,
            {
                "type": "db_change",
                "entity": self._cfg.entity,
                "action": "delete",
                "id": _to_str_id(doc.get("_id")),
            },
        )

    def _resolve_recipient_user_id(
        self, doc: dict, *, fallback_user_id: str
    ) -> Optional[str]:
        """
        Decide who should receive the WS event.
        - scope=user: always one user
        - scope=mixed: user docs go to that user; global docs (user_id None) -> return None (no emit)
        """
        if self._cfg.scope == "user":
            owner_field = self._cfg.owner_field
            if owner_field is None:
                return fallback_user_id
            return _to_str_id(doc.get(owner_field)) or fallback_user_id

        if self._cfg.scope == "mixed":
            owner_field = self._cfg.owner_field or "user_id"
            owner = doc.get(owner_field)
            if owner is None:
                # global exercise: do not broadcast
                return None
            return _to_str_id(owner)

        # default: be safe
        return fallback_user_id

    def _serialize(self, doc: dict) -> dict:
        doc = dict(doc)
        if "_id" in doc:
            doc["id"] = _to_str_id(doc.pop("_id"))
        # Optionally normalize user_id if it’s an ObjectId anywhere
        if "user_id" in doc:
            doc["user_id"] = _to_str_id(doc["user_id"])
        return doc


class ObservableDB:
    """
    Usage:
      odb = ObservableDB(db, user_id=user_id, emit=emit_fn)
      await odb.templates.insert_one({...})
    """

    def __init__(self, db, *, user_id: str, emit: Callable[[str, dict], Any]):
        self._db = db
        self._user_id = user_id
        self._emit = emit

        # Explicit properties for the collections you care about
        self.users = self._wrap("users")
        self.profiles = self._wrap("profiles")
        self.profile_insights = self._wrap("profile_insights")

        self.exercises = self._wrap("exercises")
        self.templates = self._wrap("templates")
        self.planned_workouts = self._wrap("planned_workouts")
        self.workouts = self._wrap("workouts")
        self.prs = self._wrap("prs")

        self.conversations = self._wrap("conversations")
        self.chat_messages = self._wrap("chat_messages")
        self.ai_jobs = self._wrap("ai_jobs")

    def _wrap(self, collection_name: str) -> ObservableCollection:
        cfg = ENTITY_CONFIG.get(collection_name)
        if not cfg:
            raise KeyError(f"Missing ENTITY_CONFIG for collection: {collection_name}")

        col = getattr(self._db, collection_name)
        return ObservableCollection(
            col,
            user_id=self._user_id,
            emit=self._emit,
            config=cfg,
        )
