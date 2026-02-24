# services/ai/runner.py

import asyncio
import json
import os
from bson import ObjectId

from .jobs import mark_completed, mark_failed
from .emitter import AIEmitter
from .openai_client import stream_chat
from .tools.registry import OPENAI_TOOLS, execute_tool
from .prompts.system import build_system_prompt
from services.ai.store import add_message, list_messages, touch_conversation

MAX_TOOL_ROUNDS = 6


class AIRunner:
    def __init__(self, db, ws_manager):
        self.db = db
        self.ws_manager = ws_manager

    async def run_chat(self, job_id: str, user_id: str, input_payload: dict) -> str:
        """
        Expects:
          - job_id: already created by the API layer
          - user_id: current user id
          - input_payload: {"messages": [...]} (or whatever your API sends)
          - conversation_id: optional, for storing messages in a conversation thread
        Returns:
          - job_id
        """

        emitter = AIEmitter(self.db, self.ws_manager)

        try:
            conversation_id = input_payload.get("conversation_id")
            if not conversation_id:
                raise Exception("conversation_id missing")

            # if your frontend includes system/tool roles, keep them as-is;
            # we prepend our own system message below.

            user_doc = await self.db.users.find_one({"_id": ObjectId(user_id)})
            user_context = {"profile": user_doc or {}}
            system_prompt = build_system_prompt(user_context)

            openai_messages = [{"role": "system", "content": system_prompt}]
            history = await list_messages(self.db, user_id, conversation_id, limit=200)
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
                        self.db,
                        user_id=user_id,
                        conversation_id=conversation_id,
                        role="assistant",
                        content=assistant_content,
                    )
                    await touch_conversation(self.db, conversation_id)
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
                    self.db,
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
                            tool_name, parsed_args, self.db, user_id
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
                        self.db,
                        user_id=user_id,
                        conversation_id=conversation_id,
                        role="tool",
                        content=tool_content,
                        tool_call_id=tc["id"],
                        tool_name=tool_name,
                    )
                    await touch_conversation(self.db, conversation_id)

            await emitter.emit(job_id, "done", {})
            await mark_completed(self.db, job_id)

        except Exception as e:
            await emitter.emit(job_id, "error", {"message": str(e)})
            # add an error message to the conversation
            await add_message(
                self.db,
                user_id=user_id,
                conversation_id=input_payload.get("conversation_id"),
                role="assistant",
                content=f"Error: {str(e)}",
            )
            await mark_failed(self.db, job_id)

        return job_id
