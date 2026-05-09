# Here are your Instructions
# Strong AI — AI-Powered Workout Tracker

Strong AI is a cross-platform fitness tracking app with a built-in AI coach. It lets you log workouts, track personal records, schedule routines, and have real-time conversations with an AI that knows your actual training history, goals, and injury context.

---

## Features

### Workout Tracking
- Log sets, reps, weight, duration, and distance for any exercise
- 13 exercise kinds (Barbell, Dumbbell, Machine, Weighted Bodyweight, Cardio, etc.) with per-kind field rules — no irrelevant inputs
- Live workout timer and session management
- Automatic personal record detection on completion

### Exercise Library
- Global exercise database seeded with categorized movements
- Create custom exercises with body part tags and category
- Filter by category, body part, and kind
- 20+ body part targets across 8 training categories (Strength, Cardio, Mobility, Plyometric, etc.)

### Templates & Planning
- Save workouts as reusable templates with default sets
- Schedule planned workouts on specific dates
- Recurring workout patterns (daily, weekly, etc.)
- One-tap "start from template" to pre-fill a session

### Personal Records
- Tracks PRs per exercise: 1RM, max weight, max reps, max volume, best duration/distance
- PR history over time, queryable by the AI coach

### AI Coaching Chat
- Conversational AI coach with full access to your training data via tool calls
- Tools cover: exercise lookup, workout history analysis, PR queries, schedule inspection, profile/goal context
- Responses are grounded in your real data — not generic advice
- Streaming output delivered token-by-token over WebSocket
- Multi-turn conversations with persistent history
- Auto-named conversation threads
- AI extracts structured insights (injuries, strengths, training phase) from your profile narrative

### User Profile & Onboarding
- Onboarding flow captures training background, goals, injuries, and experience level
- Profile settings editable at any time
- AI reads profile insights when building coaching context

### Authentication
- Email + password registration and login
- Apple Sign-In
- JWT access tokens with silent refresh

### Real-Time Sync
- WebSocket connection pushes database changes to all connected clients
- Edits on one device appear instantly on another
- Stores re-fetch reactively on relevant change events

---

## Design & Style

The app uses a dark, high-contrast aesthetic suited for gym environments — readable under bright lights with a single hand. The UI prioritizes fast input: adding a set is a single tap, weight/reps update inline with minimal chrome. Navigation is tab-based with no deep nesting for the most-used flows. The AI chat interface sits alongside the tracker as a peer feature, not an afterthought.

Tone in the AI responses is direct and data-informed. The coach cites your actual numbers rather than speaking in generalities.

---

## Goals

- Make workout logging fast enough that you actually do it between sets
- Give the AI coach real context (your history, PRs, schedule, injuries) so its advice is actionable
- Support a full training lifecycle: plan → execute → review → adjust
- Run natively on iOS and Android with a shared codebase, no capability compromise

---

## Architecture

### Overview

```
┌─────────────────────────────────┐     WebSocket / REST
│   React Native + Expo (Frontend)│ ◄──────────────────► ┌──────────────────────────┐
│   iOS · Android · Web           │                       │   FastAPI Backend         │
└─────────────────────────────────┘                       │   Python · MongoDB        │
                                                          └──────────────────────────┘
                                                                      │
                                                          ┌──────────────────────────┐
                                                          │   AI Service (services/ai)│
                                                          │   OpenAI · Tool Loop      │
                                                          └──────────────────────────┘
```

### Frontend

**Stack:** React Native · Expo 54 · TypeScript · Expo Router · Zustand · Axios

**File structure:**
```
frontend/
├── app/                    # Expo Router screens (file-based routing)
│   ├── (auth)/             # Login, registration
