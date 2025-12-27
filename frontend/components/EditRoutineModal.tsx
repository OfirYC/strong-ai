import React from "react";
import { Modal } from "react-native";

import { ModifyRoutine } from "../components/ModifyRoutine";
import { WorkoutTemplate } from "../types";
import api from "../utils/api";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface EditRoutineModalProps {
  visible: boolean;
  routine: WorkoutTemplate;
  onClose: () => void;
  onRoutineEdited: (newRoutine: WorkoutTemplate) => void;
}
export function EditRoutineModal({
  visible,
  routine,
  onClose,
  onRoutineEdited,
}: EditRoutineModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <ModifyRoutine
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
        routine={routine}
        title="Edit Routine"
        onClose={onClose}
        onSaveRoutine={async (name, notes, exercises) => {
          await api.put("/templates/" + routine.id, {
            name: name.trim(),
            notes: notes.trim(),
            exercises: exercises,
          });
          onRoutineEdited({
            ...routine,
            name,
            notes,
            exercises,
          });
        }}
      />
    </Modal>
  );
}
