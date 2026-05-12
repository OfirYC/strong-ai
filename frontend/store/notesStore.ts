import { create } from "zustand";
import { NoteEntry } from "../types/gen";

interface NotesState {
  notes: NoteEntry[];
  setNotes: (notes: NoteEntry[]) => void;
  upsert: (note: NoteEntry) => void;
  remove: (id: string) => void;
}

export const useNotesStoreInternal = create<NotesState>()(set => ({
  notes: [],
  setNotes: notes => set({ notes }),
  upsert: note =>
    set(state => {
      const idx = state.notes.findIndex(n => n.id === note.id);
      if (idx >= 0) {
        const next = [...state.notes];
        next[idx] = note;
        return { notes: next };
      }
      return { notes: [note, ...state.notes] };
    }),
  remove: id =>
    set(state => ({ notes: state.notes.filter(n => n.id !== id) })),
}));

export const useNotes = () => useNotesStoreInternal(s => s.notes);
