// components/NotesModal.tsx
import { Ionicons } from "@expo/vector-icons";
import { NoteEntry as Note } from "../types/gen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNotesStoreInternal } from "../store/notesStore";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../utils/api";

// ─── Types ────────────────────────────────────────────────────────────────────

const TAGS = ["goal", "injury", "preference", "observation", "other"];

const TAG_COLORS: Record<string, string> = {
  goal: "#007AFF",
  injury: "#FF3B30",
  preference: "#AF52DE",
  observation: "#34C759",
  other: "#8E8E93",
};

// ─── NoteCard ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  onEdit,
  onDelete,
}: {
  note: Note;
  onEdit: (note: Note) => void;
  onDelete: (id: string) => void;
}) {
  const tagColor = note.tag ? (TAG_COLORS[note.tag] ?? TAG_COLORS.other) : null;
  const date = new Date(note.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.topRow}>
        <View style={cardStyles.meta}>
          {note.tag && tagColor && (
            <View
              style={[
                cardStyles.tag,
                { backgroundColor: tagColor + "22", borderColor: tagColor },
              ]}
            >
              <Text style={[cardStyles.tagText, { color: tagColor }]}>
                {note.tag}
              </Text>
            </View>
          )}
          <Text style={cardStyles.date}>{date}</Text>
        </View>
        {note.writer === "user" && (
          <View style={cardStyles.actions}>
            <TouchableOpacity
              onPress={() => onEdit(note)}
              style={cardStyles.actionBtn}
            >
              <Ionicons name="pencil-outline" size={16} color="#8E8E93" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDelete(note.id)}
              style={cardStyles.actionBtn}
            >
              <Ionicons name="trash-outline" size={16} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        )}
        {note.writer === "ai" && (
          <View style={cardStyles.aiTag}>
            <Ionicons name="sparkles" size={12} color="#AF52DE" />
            <Text style={cardStyles.aiTagText}>AI</Text>
          </View>
        )}
      </View>
      <Text style={cardStyles.content}>{note.content}</Text>
    </View>
  );
}

// ─── NoteComposer ─────────────────────────────────────────────────────────────

function NoteComposer({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Note | null;
  onSave: (content: string, tag: string | null) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [content, setContent] = useState(initial?.content ?? "");
  const [tag, setTag] = useState<string | null>(initial?.tag ?? null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  return (
    <View style={composerStyles.container}>
      <TextInput
        ref={inputRef}
        style={composerStyles.input}
        value={content}
        onChangeText={setContent}
        placeholder="Write a note…"
        placeholderTextColor="#C7C7CC"
        multiline
        maxLength={1000}
      />
      <Text style={composerStyles.counter}>{content.length}/1000</Text>

      {/* Tag selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={composerStyles.tags}
      >
        <TouchableOpacity
          style={[composerStyles.tagChip, !tag && composerStyles.tagChipActive]}
          onPress={() => setTag(null)}
        >
          <Text
            style={[
              composerStyles.tagChipText,
              !tag && composerStyles.tagChipTextActive,
            ]}
          >
            None
          </Text>
        </TouchableOpacity>
        {TAGS.map(t => (
          <TouchableOpacity
            key={t}
            style={[
              composerStyles.tagChip,
              tag === t && {
                backgroundColor: TAG_COLORS[t] + "22",
                borderColor: TAG_COLORS[t],
              },
            ]}
            onPress={() => setTag(t)}
          >
            <Text
              style={[
                composerStyles.tagChipText,
                tag === t && { color: TAG_COLORS[t], fontWeight: "600" },
              ]}
            >
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={composerStyles.row}>
        <TouchableOpacity style={composerStyles.cancelBtn} onPress={onCancel}>
          <Text style={composerStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            composerStyles.saveBtn,
            (!content.trim() || saving) && composerStyles.saveBtnDisabled,
          ]}
          onPress={() => onSave(content.trim(), tag)}
          disabled={!content.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={composerStyles.saveText}>
              {initial ? "Update" : "Save"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function NotesModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { notes, setNotes, upsert: upsertNote, remove: removeNote } =
    useNotesStoreInternal();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);

  // ── Fetch (on open, store is source of truth thereafter) ─────────────────
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    api
      .get("/notes")
      .then(r => setNotes(r.data.notes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible]);

  // ── Create ───────────────────────────────────────────────────────────────
  const handleCreate = useCallback(
    async (content: string, tag: string | null) => {
      setSaving(true);
      try {
        const r = await api.post("/notes", { content, tag, writer: "user" });
        upsertNote(r.data);
        setComposing(false);
      } catch {
        Alert.alert("Error", "Failed to save note.");
      } finally {
        setSaving(false);
      }
    },
    [upsertNote],
  );

  // ── Update ───────────────────────────────────────────────────────────────
  const handleUpdate = useCallback(
    async (content: string, tag: string | null) => {
      if (!editing) return;
      setSaving(true);
      try {
        const r = await api.patch(`/notes/${editing.id}`, { content, tag });
        upsertNote(r.data);
        setEditing(null);
      } catch {
        Alert.alert("Error", "Failed to update note.");
      } finally {
        setSaving(false);
      }
    },
    [editing, upsertNote],
  );

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert("Delete Note", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/notes/${id}`);
              removeNote(id);
            } catch {
              Alert.alert("Error", "Failed to delete note.");
            }
          },
        },
      ]);
    },
    [removeNote],
  );

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setComposing(false);
      setEditing(null);
    }, 300);
  };

  const aiNotes = notes.filter(n => n.writer === "ai");
  const userNotes = notes.filter(n => n.writer === "user");

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
              <Ionicons name="close" size={26} color="#1C1C1E" />
            </TouchableOpacity>
            <Text style={styles.title}>Notes</Text>
            <TouchableOpacity
              onPress={() => {
                setEditing(null);
                setComposing(true);
              }}
              style={styles.headerBtn}
            >
              <Ionicons name="add" size={28} color="#007AFF" />
            </TouchableOpacity>
          </View>

          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Composer / Editor */}
              {(composing || editing) && (
                <NoteComposer
                  initial={editing}
                  onSave={editing ? handleUpdate : handleCreate}
                  onCancel={() => {
                    setComposing(false);
                    setEditing(null);
                  }}
                  saving={saving}
                />
              )}

              {loading && (
                <View style={styles.center}>
                  <ActivityIndicator size="large" color="#007AFF" />
                </View>
              )}

              {!loading && notes.length === 0 && !composing && (
                <View style={styles.empty}>
                  <Ionicons
                    name="document-text-outline"
                    size={52}
                    color="#C7C7CC"
                  />
                  <Text style={styles.emptyTitle}>No notes yet</Text>
                  <Text style={styles.emptySub}>
                    Tap + to add your first note.{"\n"}The AI will also write
                    observations here.
                  </Text>
                </View>
              )}

              {/* AI notes */}
              {aiNotes.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="sparkles" size={14} color="#AF52DE" />
                    <Text style={[styles.sectionTitle, { color: "#AF52DE" }]}>
                      AI Observations
                    </Text>
                  </View>
                  {aiNotes.map(n => (
                    <NoteCard
                      key={n.id}
                      note={n}
                      onEdit={setEditing}
                      onDelete={handleDelete}
                    />
                  ))}
                </>
              )}

              {/* User notes */}
              {userNotes.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="person-outline" size={14} color="#3A3A3C" />
                    <Text style={styles.sectionTitle}>Your Notes</Text>
                  </View>
                  {userNotes.map(n => (
                    <NoteCard
                      key={n.id}
                      note={n}
                      onEdit={setEditing}
                      onDelete={handleDelete}
                    />
                  ))}
                </>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F7" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5EA",
  },
  headerBtn: { width: 44, alignItems: "flex-start" },
  title: { fontSize: 17, fontWeight: "600", color: "#1C1C1E" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  center: { alignItems: "center", paddingVertical: 60 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3A3A3C",
    letterSpacing: 0.3,
  },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "600", color: "#8E8E93" },
  emptySub: {
    fontSize: 14,
    color: "#C7C7CC",
    textAlign: "center",
    lineHeight: 20,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagText: { fontSize: 11, fontWeight: "600" },
  date: { fontSize: 12, color: "#8E8E93" },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: { padding: 4 },
  aiTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#AF52DE22",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  aiTagText: { fontSize: 11, fontWeight: "600", color: "#AF52DE" },
  content: { fontSize: 15, color: "#1C1C1E", lineHeight: 22 },
});

const composerStyles = StyleSheet.create({
  container: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: "#007AFF",
  },
  input: {
    fontSize: 15,
    color: "#1C1C1E",
    minHeight: 80,
    textAlignVertical: "top",
    lineHeight: 22,
  },
  counter: {
    fontSize: 11,
    color: "#C7C7CC",
    textAlign: "right",
    marginBottom: 10,
  },
  tags: { flexDirection: "row", gap: 8, marginBottom: 14 },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F2F2F7",
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  tagChipActive: { backgroundColor: "#007AFF22", borderColor: "#007AFF" },
  tagChipText: { fontSize: 13, color: "#3A3A3C" },
  tagChipTextActive: { color: "#007AFF", fontWeight: "600" },
  row: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F2F2F7",
  },
  cancelText: { fontSize: 15, color: "#8E8E93", fontWeight: "500" },
  saveBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#007AFF",
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { fontSize: 15, color: "#FFF", fontWeight: "600" },
});
