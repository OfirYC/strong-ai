// wsEvents.ts
export type DbEntity =
  | "user"
  | "profile"
  | "profile_insights"
  | "exercise"
  | "template"
  | "planned_workout"
  | "workout_session"
  | "pr_record"
  | "conversation";

export type DbChangeAction = "upsert" | "delete";

export type HelloEvent = {
  type: "hello";
  user_id: string;
};

/**
 * Matches observable_db.py emit payloads exactly.
 * - upsert may have payload=null (insert succeeded but refetch failed)
 * - delete never includes payload
 */
export type DbChangeEvent = {
  type: "db_change";
  entity: DbEntity;
  action: DbChangeAction;
  id: string;
} & (
  | {
      action: "upsert";
      payload: Record<string, unknown> | null;
    }
  | {
      action: "delete";
      payload?: never;
    }
);

export type WsEvent = HelloEvent | DbChangeEvent;

// Convenience type guards
export const isHelloEvent = (e: WsEvent): e is HelloEvent => e.type === "hello";
export const isDbChangeEvent = (e: WsEvent): e is DbChangeEvent =>
  e.type === "db_change";
