# services/ai/runner.py

import asyncio
import json
import os
from bson import ObjectId

from .jobs import mark_completed, mark_failed
from .emitter import AIEmitter
from .openai_client import stream_chat, client as openai_client
from .config import DEFAULT_MODEL
from .tools.registry import OPENAI_TOOLS, TOOL_REGISTRY, execute_tool
from .prompts.system import build_system_prompt
from services.ai.store import (
    add_message,
    list_messages,
    touch_conversation,
    build_notes_context,
)

MAX_TOOL_ROUNDS = 6


class AIRunner:
    def __init__(self, db, ws_manager):
        effective_db = db
        self.ws_manager = ws_manager

    async def run_chat(
        self,
        job_id: str,
        user_id: str,
        input_payload: dict,
        db=None,  # optional override
    ) -> str:
        """
        Expects:
          - job_id: already created by the API layer
          - user_id: current user id
          - input_payload: {"messages": [...]} (or whatever your API sends)
          - conversation_id: optional, for storing messages in a conversation thread
        Returns:
          - job_id
        """

        effective_db = db or self.db
        emitter = AIEmitter(effective_db, self.ws_manager)

        try:
            conversation_id = input_payload.get("conversation_id")
            if not conversation_id:
                raise Exception("conversation_id missing")

            # if your frontend includes system/tool roles, keep them as-is;
            # we prepend our own system message below.

            user_doc = await effective_db.users.find_one({"_id": ObjectId(user_id)})
            profile_dict = (user_doc or {}).get("profile", {}) or {}
            insights = await effective_db.profile_insights.find_one({"user_id": user_id}) or {}
            insights.pop("_id", None)
            user_context = {
                "profile": profile_dict,
                "insights": insights,
                "recent_workouts": await _fetch_recent_workouts(effective_db, user_id),
            }
            system_prompt = build_system_prompt(user_context)

            notes_block = await build_notes_context(effective_db, user_id)
            if notes_block:
                system_prompt += f"\n\n{notes_block}"

            openai_messages = [{"role": "system", "content": system_prompt}]
            history = await list_messages(
                effective_db, user_id, conversation_id, limit=200
            )
            openai_messages.extend(history)

            print(
                f"Starting AI job {job_id} with conversation {conversation_id} and message history:",
                openai_messages,
            )

            for _ in range(MAX_TOOL_ROUNDS):
                stream = await stream_chat(openai_messages, OPENAI_TOOLS)

                assistant_content = ""
                tool_calls_buffer = {}  # idx -> {id,name,arguments}

                async for chunk in stream:
                    if not chunk.choices:
                        continue  # skip empty or control chunks

                    choice = chunk.choices[0]
                    delta = choice.delta

                    # text tokens
                    if getattr(delta, "content", None):
                        token = delta.content
                        assistant_content += token
                        await emitter.emit(job_id, "assistant_token", {"token": token})

                    # tool calls (streamed)
                    if getattr(delta, "tool_calls", None):
                        for tc in delta.tool_calls:
                            idx = tc.index
                            if idx not in tool_calls_buffer:
                                tool_calls_buffer[idx] = {
                                    "id": tc.id,
                                    "name": None,
                                    "arguments": "",
                                }

                            fn = getattr(tc, "function", None)
                            if fn:
                                if getattr(fn, "name", None):
                                    tool_calls_buffer[idx]["name"] = fn.name
                                if getattr(fn, "arguments", None):
                                    tool_calls_buffer[idx]["arguments"] += fn.arguments

                # no tools -> final assistant message
                if not tool_calls_buffer:
                    await add_message(
                        effective_db,
                        user_id=user_id,
                        conversation_id=conversation_id,
                        role="assistant",
                        content=assistant_content,
                    )
                    await touch_conversation(effective_db, conversation_id)
                    await emitter.emit(
                        job_id, "assistant_message", {"content": assistant_content}
                    )
                    break

                # append assistant message w/ tool calls
                assistant_tool_message = {
                    "role": "assistant",
                    "content": assistant_content or None,
                    "tool_calls": [
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": tc["arguments"],
                            },
                        }
                        for tc in tool_calls_buffer.values()
                    ],
                }

                openai_messages.append(assistant_tool_message)

                await add_message(
                    effective_db,
                    user_id=user_id,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=assistant_content or "",
                    tool_calls=assistant_tool_message["tool_calls"],
                )

                # Emit tool calls

                # execute tools + append tool results
                for tc in tool_calls_buffer.values():
                    tool_name = tc["name"]
                    raw_args = tc["arguments"]

                    try:
                        parsed_args = json.loads(raw_args or "{}")
                    except json.JSONDecodeError:
                        parsed_args = {}

                    ## print timestamp when emitting
                    from datetime import datetime

                    print(
                        f"{datetime.utcnow().isoformat()} - Executing tool {tool_name} with args {parsed_args} in job {job_id}"
                    )
                    await emitter.emit(
                        job_id,
                        "tool_start",
                        {
                            "tool": tool_name,
                            "tool_call_id": tc["id"],
                            "arguments": raw_args or "{}",
                        },
                    )
                    print(
                        f"{datetime.utcnow().isoformat()} - Finished executing tool {tool_name} in job {job_id}"
                    )

                    try:
                        tool_result = await execute_tool(
                            tool_name, parsed_args, effective_db, user_id
                        )
                        await emitter.emit(
                            job_id,
                            "tool_result",
                            {
                                "tool": tool_name,
                                "result": tool_result,
                                "tool_call_id": tc["id"],
                            },
                        )
                        print(
                            f"{datetime.utcnow().isoformat()} - Emitted tool result for {tool_name} in job {job_id}"
                        )
                        tool_content = (
                            tool_result
                            if isinstance(tool_result, str)
                            else json.dumps(tool_result)
                        )
                    except Exception as e:
                        await emitter.emit(
                            job_id, "tool_error", {"tool": tool_name, "message": str(e)}
                        )
                        tool_content = json.dumps({"error": str(e)})

                    openai_messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": tool_content,
                        }
                    )

                    await add_message(
                        effective_db,
                        user_id=user_id,
                        conversation_id=conversation_id,
                        role="tool",
                        content=tool_content,
                        tool_call_id=tc["id"],
                        tool_name=tool_name,
                    )
                    await touch_conversation(effective_db, conversation_id)

            await emitter.emit(job_id, "done", {})
            await mark_completed(effective_db, job_id)
            asyncio.create_task(
                _run_summary_pass(effective_db, user_id, conversation_id)
            )

        except Exception as e:
            import traceback

            print("\n\n===== AI RUNNER CRASH =====")
            traceback.print_exc()
            print("===== END TRACE =====\n\n")

            await emitter.emit(job_id, "error", {"message": str(e)})
            # add an error message to the conversation
            await add_message(
                effective_db,
                user_id=user_id,
                conversation_id=input_payload.get("conversation_id"),
                role="assistant",
                content=f"Error: {str(e)}",
            )
            await mark_failed(effective_db, job_id)

        return job_id


async def _fetch_recent_workouts(db, user_id: str, n: int = 3) -> list:
    docs = await (
        db.workouts.find({"user_id": user_id, "ended_at": {"$ne": None}})
        .sort("ended_at", -1)
        .limit(n)
        .to_list(n)
    )
    return docs


_NOTES_TOOL_NAMES = {
    "search_notes",
    "create_note",
    "update_note",
    "delete_note",
    "list_notes",
}
_SUMMARY_SYSTEM = """\
You are a memory extraction agent. Review the conversation and persist any meaningful new facts
about the user using the notes tools. Focus on:
- Injuries, pain, or physical complaints
- Goals mentioned or updated
- Preferences, constraints, or training habits

Rules:
1. Call search_notes BEFORE creating a note to avoid duplicates.
2. UPDATE existing notes rather than creating new ones when the topic overlaps.
3. Only persist things the user actually stated — do not invent.
4. Skip anything already captured accurately in existing notes.
5. If nothing new was revealed, call no tools."""


async def _run_summary_pass(db, user_id: str, conversation_id: str) -> None:
    try:
        history = await list_messages(db, user_id, conversation_id, limit=200)
        if not history:
            return

        notes_tools = [
            t for t in OPENAI_TOOLS if t["function"]["name"] in _NOTES_TOOL_NAMES
        ]
        messages = [{"role": "system", "content": _SUMMARY_SYSTEM}, *history]

        for _ in range(3):
            resp = await openai_client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=messages,
                tools=notes_tools,
                temperature=0.2,
                stream=False,
            )
            msg = resp.choices[0].message

            if not msg.tool_calls:
                break

            messages.append(
                {
                    "role": "assistant",
                    "content": msg.content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in msg.tool_calls
                    ],
                }
            )

            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                    tool = TOOL_REGISTRY.get(tc.function.name)
                    result = (
                        await tool.execute(args, {"db": db, "user_id": user_id})
                        if tool
                        else json.dumps({"error": "unknown tool"})
                    )
                except Exception as e:
                    result = json.dumps({"error": str(e)})
                messages.append(
                    {"role": "tool", "tool_call_id": tc.id, "content": result}
                )

    except Exception:
        import traceback

        print("\n\n===== SUMMARY PASS ERROR =====")
        traceback.print_exc()
        print("===========================\n\n")
