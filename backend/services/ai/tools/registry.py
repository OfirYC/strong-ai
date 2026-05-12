from typing import Dict, List

from .base import BaseTool
from .profile import ProfileGetContext, ProfileUpdateInsights
from .exercise import ExerciseCreateBatch, ExerciseGetByIds, ExerciseSearch
from .template import (
    TemplateGetAll,
    TemplateCreate,
    TemplateUpdate,
    TemplateGetById,
    TemplateInsertExercises,
    TemplateRemoveExercisesByIndex,
)
from .schedule import (
    ScheduleGet,
    ScheduleAddWorkout,
    SchedulePatchOccurrence,
    ScheduleUpdateWorkout,
    ScheduleDeleteWorkout,
)
from .history import WorkoutHistoryGetAll, WorkoutHistoryGetByExercise
from .notes import CreateNoteTool, UpdateNoteTool, DeleteNoteTool, ListNotesTool, SearchNotesTool

# All tools in order
ALL_TOOLS: List[BaseTool] = [
    ProfileGetContext(),
    ProfileUpdateInsights(),
    ExerciseSearch(),
    ExerciseCreateBatch(),
    ExerciseGetByIds(),
    TemplateGetAll(),
    TemplateGetById(),
    TemplateCreate(),
    TemplateUpdate(),
    TemplateInsertExercises(),
    TemplateRemoveExercisesByIndex(),
    ScheduleGet(),
    ScheduleAddWorkout(),
    ScheduleUpdateWorkout(),
    SchedulePatchOccurrence(),
    ScheduleDeleteWorkout(),
    WorkoutHistoryGetAll(),
    WorkoutHistoryGetByExercise(),
    SearchNotesTool(),
    CreateNoteTool(),
    UpdateNoteTool(),
    DeleteNoteTool(),
    ListNotesTool(),
]

# name -> tool instance
TOOL_REGISTRY: Dict[str, BaseTool] = {tool.name: tool for tool in ALL_TOOLS}

# OpenAI-compatible schema list (pass directly to `tools=` param)
OPENAI_TOOLS: List[dict] = [tool.openai_schema for tool in ALL_TOOLS]


async def execute_tool(tool_name: str, arguments: dict, db, user_id: str) -> str:
    """Dispatch a tool call by name."""
    import json

    tool = TOOL_REGISTRY.get(tool_name)
    if not tool:
        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    ctx = {"db": db, "user_id": user_id}
    try:
        return await tool.execute(arguments, ctx)
    except Exception as e:
        import logging

        logging.getLogger(__name__).exception(f"Tool execution error: {tool_name}")
        raise e
