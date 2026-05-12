# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
cd backend
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
# or just: ./backend.sh
```

### Frontend
```bash
cd frontend
yarn start          # Expo dev server
yarn ios            # Run on iOS simulator
yarn android        # Run on Android
yarn lint           # ESLint
```

### Type Generation (run with backend running)
```bash
cd frontend
yarn generate:types  # Fetches OpenAPI spec → types/models.ts + types/gen.ts
```
This requires the backend to be running at `EXPO_PUBLIC_BACKEND_URL`. Always re-run this after changing backend models.

### Backend tests
```bash
cd backend && source venv/bin/activate && pytest
```

## Architecture

### Stack
- **Backend**: Python FastAPI + Motor (async MongoDB) on port 8001
- **Frontend**: React Native (Expo SDK 54, Expo Router file-based routing) + TypeScript + Zustand
- **AI**: OpenAI API (streamed tool-calls via `services/ai/`)
- **Database**: MongoDB (`workout_tracker` DB by default)

### Real-time data flow
Every write on the backend goes through `ObservableDB` (`backend/observable_db.py`), which wraps Motor collections. On any insert/update/delete, it emits a `db_change` WebSocket event to the owning user via `WSManager` (`backend/ws_manager.py`). The frontend connects at `/ws?token=...` (registered in `frontend/realtime/registerRealtime.ts`) and routes `db_change` events to the appropriate Zustand store via `upsert` / `remove`. This means the frontend stays in sync without polling — the stores are updated automatically when the backend writes.

To add real-time sync for a new collection:
1. Add it to `ENTITY_CONFIG` in `observable_db.py`
2. Add a `_wrap()` call in `ObservableDB.__init__`
3. Handle the entity in `registerRealtime.ts`

### AI chat pipeline
1. Frontend calls `POST /api/ai/chat/start` → gets back `job_id`
2. Frontend opens a WebSocket at `/ws/ai/jobs/{job_id}`
3. Backend runs `AIRunner.run_chat` as an asyncio task, streaming tokens/tool events via `AIEmitter`
4. `AIRunner` loops up to `MAX_TOOL_ROUNDS=6` times: stream OpenAI response → if tool calls present, execute via `execute_tool()` → append results → re-stream
5. All tools live in `backend/services/ai/tools/`. Each tool extends `BaseTool` (define `name`, `description`, `parameters`, and `execute()`). Register in `tools/registry.py`'s `ALL_TOOLS` list.

### Frontend type system
`frontend/types/models.ts` is auto-generated from the backend's OpenAPI schema. `frontend/types/gen.ts` exports cleaned-up types and enum constants. Import from `@/types` or `@/types/gen`. Never edit these files manually.

The `api` client in `frontend/utils/api.ts` is type-safe against the generated types — path strings resolve to their OpenAPI-defined request/response shapes.

### Frontend state
Zustand stores in `frontend/store/`. The active workout session is persisted to `AsyncStorage` in `workoutStore.ts`. Other stores (`exercisesStore`, `templatesStore`, `workoutsStore`, etc.) hold server data and expose `upsert`/`remove`/`refetchById` for the realtime layer.

### Exercise kinds
Exercise behavior (which set fields are valid) is controlled by `EXERCISE_KIND_RULES` in `backend/constants.py`. This is injected into the AI system prompt and used for PR tracking and history display. When adding a new exercise kind, update `constants.py`.

### Auth
JWT-based. Supports email/password and Apple Sign-In. Token stored in `AsyncStorage` under `storageKey("user")`. The `Authorization: Bearer <token>` header is injected automatically by the axios interceptor.

### MongoDB collections
`users`, `exercises` (global + per-user custom), `templates`, `workouts`, `planned_workouts`, `prs`, `conversations`, `chat_messages`, `ai_jobs`, `notes`.
