// realtime/registerRealtime.ts
import { wsClient } from "../utils/api";
import type { WsEvent, DbChangeEvent } from "../types/ws";

// Import your stores (examples; adjust to your actual APIs)
import { useExercisesStoreInternal } from "../store/exercisesStore";
import { Exercise, WorkoutSession, WorkoutTemplate } from "../types";
import { useTemplatesStoreInternal } from "../store/templatesStore";
import {
  PlannedWorkout,
  usePlannedWorkouts,
  usePlannedWorkoutsStoreInternal,
} from "../store/plannedWorkoutsStore";
import { useWorkoutsStoreInternal } from "../store/workoutsStore";
// import { useTemplates } from "../store/templatesStore";
// import { usePlannedWorkouts } from "../store/plannedWorkoutsStore";
// import { useWorkouts } from "../store/workoutsStore";
// import { useUserStore } from "../store/userStore";
// import { usePrRecords } from "../store/prRecordsStore";

function handleDbChange(e: DbChangeEvent) {
  const { entity, action, id, payload } = e;

  // IMPORTANT: payload can be null for upsert (insert succeeded but refetch failed)
  // In that case, best action is a targeted refetch by id if you have it.
  const hasPayload = payload != null;

  switch (entity) {
    case "exercise":
      console.log("[WS] exercise db_change", action, id, payload);
      if (action === "delete") useExercisesStoreInternal.getState().remove(id);
      else if (hasPayload)
        useExercisesStoreInternal
          .getState()
          .upsert(payload as unknown as Exercise);
      else useExercisesStoreInternal.getState().refetchById?.(id);
      return;

    case "template":
      console.log("[WS] template db_change", action, id, payload);
      if (action === "delete") useTemplatesStoreInternal.getState().remove(id);
      else if (hasPayload)
        useTemplatesStoreInternal
          .getState()
          .upsert(payload as unknown as WorkoutTemplate);
      else useTemplatesStoreInternal.getState().refetchById?.(id);
      return;

    case "planned_workout":
      if (action === "delete")
        usePlannedWorkoutsStoreInternal.getState().remove(id);
      else if (hasPayload)
        usePlannedWorkoutsStoreInternal
          .getState()
          .upsert(payload as unknown as PlannedWorkout);
      else usePlannedWorkoutsStoreInternal.getState().refetchById?.(id);
      return;

    case "workout_session":
      console.log("[WS] workout_session db_change", action, id, payload);
      if (action === "delete") useWorkoutsStoreInternal.getState().remove(id);
      else if (hasPayload)
        useWorkoutsStoreInternal
          .getState()
          .upsert(payload as unknown as WorkoutSession);
      else useWorkoutsStoreInternal.getState().refetchById?.(id);
      return;

    case "user":
    case "profile":
    case "profile_insights":
    //   // however you model this locally
    //   if (action === "upsert" && hasPayload)
    //     useUserStore.getState().mergeFromServer(payload);
    //   else useUserStore.getState().refetch?.();
    //   return;

    case "pr_record":
    //   if (action === "delete") usePrRecords.getState().remove(id);
    //   else if (hasPayload) usePrRecords.getState().upsert(payload);
    //   else usePrRecords.getState().refetchById?.(id);
    //   return;
    default:
      console.warn(`[WS] Unknown entity type in db_change event: ${entity}`);
      return;
  }
}

export function registerRealtime() {
  wsClient.setHandlers({
    onOpen: () => console.log("[WS] connected"),
    onClose: e => console.log("[WS] closed", e),
    onError: e => console.log("[WS] error", e),
    onMessage: (evt: WsEvent) => {
      console.log(
        "[WS] message",
        evt.type,
        evt.type === "db_change" ? evt.entity : ""
      );
      if (evt.type === "db_change") handleDbChange(evt);
    },
  });

  // Start immediately; it will no-op if no token exists
  void wsClient.start();

  // Return cleanup if you want it
  return () => wsClient.stop();
}
