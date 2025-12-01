import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { Exercise } from '../types';

const MUSCLE_GROUPS = ['All', 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Abs', 'Full Body'];

interface ExercisePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectExercise: (exercise: Exercise) => void;
  onCreateNew?: () => void;
}

export default function ExercisePickerModal({
  visible,
  onClose,
  onSelectExercise,
  onCreateNew,
}: ExercisePickerModalProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('All');

  useEffect(() => {
    if (visible) {
      loadExercises();
      setSearchQuery('');
      setSelectedMuscleGroup('All');
    }
  }, [visible]);

  const loadExercises = async () => {
    try {
      const response = await api.get('/exercises');
      setExercises(response.data);
    } catch (error) {
      console.error('Failed to load exercises:', error);
    }
  };

  const filteredExercises = exercises.filter(exercise => {
    const matchesSearch = !searchQuery || 
      exercise.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMuscleGroup = selectedMuscleGroup === 'All' || 
      exercise.muscle_group === selectedMuscleGroup;
    return matchesSearch && matchesMuscleGroup;
  });

  const handleSelectExercise = (exercise: Exercise) => {
    onSelectExercise(exercise);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.title}>Add Exercise</Text>
          {onCreateNew ? (
            <TouchableOpacity onPress={onCreateNew}>
              <Text style={styles.newText}>+ New</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 50 }} />
          )}
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#8E8E93" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises"
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#8E8E93" />
            </TouchableOpacity>
          )}
        </View>

        {/* Muscle Group Filter */}
        <View style={styles.filterContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={MUSCLE_GROUPS}
            keyExtractor={(item) => item}
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
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.exerciseOption}
              onPress={() => handleSelectExercise(item)}
            >
              <View style={styles.exerciseImageContainer}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.exerciseImage} />
                ) : (
                  <View style={styles.exercisePlaceholder}>
                    <Ionicons name="barbell" size={20} color="#8E8E93" />
                  </View>
                )}
              </View>
              <View style={styles.exerciseInfo}>
                <Text style={styles.exerciseName}>{item.name}</Text>
                <Text style={styles.exerciseDetail}>
                  {item.exercise_kind} • {item.primary_body_parts?.join(', ')}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="fitness-outline" size={48} color="#8E8E93" />
              <Text style={styles.emptyText}>No exercises found</Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#D1D1D6',
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  newText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1C1C1E',
  },
  filterContainer: {
    paddingLeft: 20,
    marginBottom: 12,
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  filterChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterChipText: {
    color: '#1C1C1E',
    fontSize: 14,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  exerciseOption: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  exerciseImageContainer: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 12,
  },
  exerciseImage: {
    width: '100%',
    height: '100%',
  },
  exercisePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  exerciseDetail: {
    fontSize: 14,
    color: '#6E6E73',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 12,
  },
});
