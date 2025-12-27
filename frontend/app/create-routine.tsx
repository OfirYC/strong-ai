import { useRouter } from "expo-router";
import React from "react";
import { Alert } from "react-native";

import { ModifyRoutine } from "../components/ModifyRoutine";
import api from "../utils/api";

export default function CreateRoutineScreen() {
  const router = useRouter();

  return (
    <ModifyRoutine
      title="Create Routine"
      onClose={() => router.back()}
      onSaveRoutine={async (name, notes, exercises) => {
        await api.post("/templates", {
          name: name.trim(),
          notes: notes.trim(),
          exercises: exercises,
        });
      }}
    />
  );
}
