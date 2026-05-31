import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CreateExerciseModal from "../../components/CreateExerciseModal";
import ExerciseDetailModal from "../../components/ExerciseDetailModal";
import { LoadingData } from "../../components/LoadingData";
import { useExercises } from "../../store/exercisesStore";
import { Exercise } from "../../types";
import { MUSCLE_FILTER_GROUPS, getGroupsFromLoads, matchesGroup } from "../../utils/muscleUtils";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&h=100&fit=crop";

export default function ExercisesScreen() {
  // Store
  const { byId, loading, refetchAll, upsert, list: exercises } = useExercises();

  // UI state
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    null
  );
  const selectedExercise = selectedExerciseId ? byId[selectedExerciseId] : null;

  const [showDetailModal, setShowDetailModal] = useState(false);

  // Initial load: explicit refetch (only if list is empty)
  useEffect(() => {
    if (exercises.length === 0) {
      refetchAll();
    }
  }, [exercises.length, refetchAll]);

  const filteredExercises = useMemo(() => {
    let filtered = exercises;

    if (selectedMuscleGroup !== "All") {
      filtered = filtered.filter(ex => matchesGroup(ex.muscle_loads, selectedMuscleGroup));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(ex => ex.name.toLowerCase().includes(q));
    }

    return filtered;
  }, [exercises, selectedMuscleGroup, searchQuery]);

  const handleExercisePress = (exercise: Exercise) => {
    setSelectedExerciseId(exercise.id);
    setShowDetailModal(true);
  };

  const renderExercise = ({ item }: { item: Exercise }) => (
    <TouchableOpacity
      style={styles.exerciseCard}
      onPress={() => handleExercisePress(item)}
    >
      <View style={styles.exerciseImageContainer}>
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={styles.exerciseImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.exercisePlaceholder}>
            <Ionicons name="barbell" size={24} color="#8E8E93" />
          </View>
        )}
      </View>
      <View style={styles.exerciseInfo}>
        <Text style={styles.exerciseName}>{item.name}</Text>
        <Text style={styles.exerciseDetail}>
          {item.exercise_kind}{getGroupsFromLoads(item.muscle_loads).length > 0 ? ` • ${getGroupsFromLoads(item.muscle_loads).join(", ")}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color="#8E8E93" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Exercises</Text>
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => setShowCreateModal(true)}
          >
            <Text style={styles.newButtonText}>+ New</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#8E8E93" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises"
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={MUSCLE_FILTER_GROUPS}
          keyExtractor={item => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedMuscleGroup === item && styles.filterChipActive,
              ]}
              onPress={() => setSelectedMuscleGroup(item)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedMuscleGroup === item && styles.filterChipTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <FlatList
        data={filteredExercises}
        keyExtractor={item => item.id}
        renderItem={renderExercise}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={refetchAll}
        ListEmptyComponent={
          loading ? (
            <LoadingData loadingTitle="Loading Exercises..." />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="fitness-outline" size={64} color="#3A3A3C" />
              <Text style={styles.emptyText}>No exercises found</Text>
            </View>
          )
        }
      />

      <CreateExerciseModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onExerciseCreated={(exercise: Exercise) => {
          // Add to list + cache, no network
          upsert(exercise);

          // Optional UX: open details immediately
          setSelectedExerciseId(exercise.id);
          setShowDetailModal(true);

          setShowCreateModal(false);
        }}
      />

      <ExerciseDetailModal
        visible={showDetailModal}
        exercise={selectedExercise}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedExerciseId(null);
        }}
        onExerciseUpdated={updated => {
          // Update cache + list entry, no network
          upsert(updated);
          // Keep currently-open item in sync
          setSelectedExerciseId(updated.id);
        }}
      />
    </SafeAreaView>
  );
}

// styles unchanged
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F7",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1C1C1E",
  },
  newButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#007AFF",
    borderRadius: 8,
  },
  newButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  searchContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D1D6",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 12,
    fontSize: 16,
    color: "#1C1C1E",
  },
  filterContainer: {
    paddingLeft: 20,
    marginBottom: 16,
  },
  filterChip: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#D1D1D6",
  },
  filterChipActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  filterChipText: {
    color: "#1C1C1E",
    fontSize: 14,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  exerciseCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  exerciseImageContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: "hidden",
    marginRight: 12,
  },
  exerciseImage: {
    width: "100%",
    height: "100%",
  },
  exercisePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#F5F5F7",
    alignItems: "center",
    justifyContent: "center",
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  exerciseDetail: {
    fontSize: 14,
    color: "#6E6E73",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: "#8E8E93",
    marginTop: 16,
  },
});
