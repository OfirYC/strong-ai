import { useRouter } from "expo-router";
import React from "react";
import { Alert } from "react-native";

import { ModifyRoutine } from "../components/ModifyRoutine";
import api from "../utils/api";
import { useTemplates } from "../store/templatesStore";

export default function CreateRoutineScreen() {
  const router = useRouter();
  const { upsert } = useTemplates();
  return (
    <ModifyRoutine
      title="Create Routine"
      onClose={() => router.back()}
      onSaveRoutine={async (name, notes, exercises) => {
        const response = await api.post("/templates", {
          name: name.trim(),
          notes: notes.trim(),
          exercises: exercises,
        });
        const newRoutine = response.data;
        upsert(newRoutine);
        router.back();
      }}
    />
  );
}
