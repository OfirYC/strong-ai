│   ├── (tabs)/             # Main tabbed interface
│   │   ├── workout.tsx     # Active workout session
│   │   ├── exercises.tsx   # Exercise library
│   │   ├── routines.tsx    # Templates
│   │   ├── history.tsx     # Workout history
│   │   └── profile.tsx     # User profile
│   ├── onboarding.tsx
│   ├── profile-settings.tsx
│   └── workout-detail.tsx
├── components/             # Reusable UI components
├── store/                  # Zustand stores (one per domain)
├── realtime/               # WebSocket client manager
├── hooks/                  # Custom React hooks
├── utils/                  # API client, helpers
└── types/                  # Shared TypeScript types
```

**State management (Zustand stores):**
| Store | Responsibility |
|---|---|
| `authStore` | Credentials, token refresh, login/logout |
| `workoutsStore` | Paginated workout history with smart caching |
| `exercisesStore` | Exercise library (global + user exercises) |
| `templatesStore` | Workout templates |
| `plannedWorkoutsStore` | Scheduled workouts and recurrence |
| `prsStore` | Personal records per exercise |
| `convesationsStore` | AI chat threads |
| `workoutStore` | Current active workout session |

`workoutsStore` maintains a canonical ID-keyed cache alongside a contiguous pagination index. Batch hydration (e.g. from the AI tools) populates the cache without disrupting the pagination cursor.

**Real-time client:** A single persistent WebSocket connection receives change events from the backend. Each store subscribes to relevant event types and re-fetches or patches local state accordingly.

---

### Backend

**Stack:** FastAPI · Python · MongoDB (Motor async driver) · Pydantic v2 · JWT · bcrypt

**File structure:**
```
backend/
├── server.py               # All route definitions (~1900 lines)
├── models.py               # Pydantic request/response models
├── auth.py                 # JWT creation, verification, Apple Sign-In
├── constants.py            # Exercise kind → valid field rules
├── observable_db.py        # MongoDB wrapper with change stream emission
├── ws_manager.py           # WebSocket connection pool
├── services/
│   └── ai/                 # AI coaching subsystem
│       ├── runner.py       # Tool-calling orchestration loop
│       ├── openai_client.py
│       ├── store.py        # Conversation persistence
│       ├── jobs.py         # Async job state
│       ├── emitter.py      # Streaming event emitter
│       ├── profile_insights.py
│       ├── chat_name.py
│       ├── prompts/
│       │   └── system.py   # System prompt builder
│       └── tools/          # Tool implementations
│           ├── exercise.py
│           ├── history.py
│           ├── profile.py
│           ├── schedule.py
│           ├── template.py
│           ├── shared.py
│           └── registry.py
├── seed_exercises.py
└── requirements.txt
```

**API surface:**
| Prefix | Domain |
|---|---|
| `/auth/*` | Register, login, Apple Sign-In, token refresh |
| `/profile/*` | Profile CRUD, insight extraction |
| `/exercises/*` | Exercise library management |
| `/templates/*` | Template CRUD |
| `/workouts/*` | Workout session logging |
| `/planned-workouts/*` | Schedule and recurrence |
| `/prs/*` | Personal record queries |
| `/ai/chat/*` | Conversation management and streaming |
| `/ws` | WebSocket endpoint |

**Real-time architecture:** `ObservableDB` wraps Motor collection calls and emits change events after mutations. `ws_manager.py` fans out those events to all WebSocket clients subscribed to the affected user's data.

---

### AI Coaching Subsystem

The AI service lives in `backend/services/ai/` and is the most architecturally distinct part of the system.

**Flow:**
1. Client sends a message to `/ai/chat/{conversation_id}/message`
2. Backend creates an async job and immediately returns a job ID
3. `runner.py` starts the tool-calling loop:
   - Builds a system prompt from the user's profile, injuries, recent history, and PRs
   - Calls OpenAI with the conversation history and available tools
   - If the model requests tool calls, executes them against MongoDB and appends results
   - Repeats up to 6 rounds until no further tool calls are made
   - Streams each token to the frontend via WebSocket as it arrives
4. Final message and all tool call records are persisted to MongoDB

**Available tools:**
| Tool module | Capabilities |
|---|---|
| `exercise.py` | Look up exercises by name, kind, body part |
| `history.py` | Query workout history, aggregate volume/frequency |
| `profile.py` | Read profile narrative and extracted insights |
| `schedule.py` | Inspect planned workouts and recurrence |
| `template.py` | Browse saved templates |
| `shared.py` | Utility helpers shared across tools |

**Profile insights:** When a user saves their profile narrative, `profile_insights.py` runs a separate LLM call to extract structured tags — injuries, training strengths, current phase, experience level. These tags are injected into the system prompt on every chat turn.

**System prompt construction (`prompts/system.py`):** Assembles a context block per request containing the current date, user profile summary, extracted insights, recent PR snapshots, and any upcoming planned workouts. This grounds the model without requiring it to call a tool for basic context.

---

### Data Models

Core entities (defined in `backend/models.py`):

| Entity | Key fields |
|---|---|
| `User` | email, password hash, Apple sub, profile data |
| `Exercise` | name, kind, body parts, category, owner (null = global) |
| `WorkoutTemplate` | name, exercises with default sets |
| `WorkoutSession` | date, duration, exercises → sets (weight/reps/duration/distance) |
| `PlannedWorkout` | date, template ref, recurrence rule |
| `PRRecord` | exercise ref, PR type, value, achieved date |
| `Conversation` | user ref, name, message thread |
| `ChatMessage` | role, content, tool calls, tool results |
| `ProfileInsight` | injuries, strengths, phase, goals (extracted by AI) |

**Exercise kind system:** `constants.py` maps each of the 13 `ExerciseKind` values to the set of valid tracking fields (weight, reps, duration, distance). The frontend uses this mapping to show only relevant inputs per set.

---

## Getting Started

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in MONGO_URL, OPENAI_API_KEY, JWT_SECRET
python seed_exercises.py
uvicorn server:app --reload
```

### Frontend

```bash
cd frontend
yarn install
yarn start            # Expo dev server
yarn ios              # iOS simulator
yarn android          # Android emulator
yarn web              # Browser
```

---

## Testing

```bash
# Backend integration tests
python backend_test.py
```
