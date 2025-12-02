import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useRouter, useLocalSearchParams } from 'expo-router';
import api from '../utils/api';
import { 
  WorkoutSummary, 
  WorkoutSession, 
  WorkoutSet, 
  WorkoutTemplate,
  formatDuration, 
  formatWorkoutDuration,
  formatDurationMinutes,
  isDurationBased,
  usesWeight,
  ExerciseKind 
} from '../types';
import RoutineDetailModal from '../components/RoutineDetailModal';

interface ExerciseWithSets {
  exercise_id: string;
  name: string;
  exercise_kind: ExerciseKind;
  sets: WorkoutSet[];
  estimated_1rm?: number;
}

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const [exercisesWithSets, setExercisesWithSets] = useState<ExerciseWithSets[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFullDetail, setShowFullDetail] = useState(false);
  const [routine, setRoutine] = useState<WorkoutTemplate | null>(null);
  const [showRoutineModal, setShowRoutineModal] = useState(false);

  useEffect(() => {
    if (workoutId) {
      loadWorkoutDetail();
    }
  }, [workoutId]);

  const loadWorkoutDetail = async () => {
    try {
      setLoading(true);
      
      // Load summary and full workout data
      const [summaryRes, workoutRes] = await Promise.all([
        api.get(`/workouts/${workoutId}/detail`),
        api.get(`/workouts/${workoutId}`)
      ]);
      
      setSummary(summaryRes.data);
      setWorkout(workoutRes.data);
      
      // Combine exercise info with sets
      const exercises: ExerciseWithSets[] = [];
      const workoutData = workoutRes.data as WorkoutSession;
      const summaryData = summaryRes.data as WorkoutSummary;
      
      workoutData.exercises.forEach((ex, idx) => {
        const summaryEx = summaryData.exercises.find(s => s.exercise_id === ex.exercise_id);
        exercises.push({
          exercise_id: ex.exercise_id,
          name: summaryEx?.name || 'Unknown Exercise',
          exercise_kind: summaryEx?.exercise_kind || 'Barbell',
          sets: ex.sets,
          estimated_1rm: summaryEx?.estimated_1rm
        });
      });
      
      setExercisesWithSets(exercises);
      
      // Load routine if workout was created from a template
      if (workoutData.template_id) {
        try {
          const routineRes = await api.get(`/templates/${workoutData.template_id}`);
          setRoutine(routineRes.data);
        } catch (error) {
          console.error('Failed to load routine:', error);
        }
      }
    } catch (error) {
      console.error('Failed to load workout detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatWorkoutDate = (dateStr: string): string => {
    const date = parseISO(dateStr);
    return format(date, "EEEE, d MMM yyyy — HH:mm");
  };

  const getEquipmentLabel = (kind: ExerciseKind): string => {
    switch (kind) {
      case 'Barbell': return 'Barbell';
      case 'Dumbbell': return 'Dumbbell';
      case 'Machine/Other': return 'Machine';
      case 'Weighted Bodyweight': return 'Weighted BW';
      case 'Assisted Bodyweight': return 'Assisted BW';
      case 'Reps Only': return 'Bodyweight';
      case 'Cardio': return 'Cardio';
      case 'Duration': return 'Timed';
      default: return '';
    }
  };

  const renderPRBadge = (type: string) => (
    <View style={styles.prBadge} key={type}>
      <Text style={styles.prBadgeText}>{type}</Text>
    </View>
  );

  // Helper to format pace (min:sec per km)
  const formatPace = (durationSeconds: number, distanceKm: number): string => {
    if (distanceKm <= 0) return '--:--';
    const paceSeconds = durationSeconds / distanceKm;
    const mins = Math.floor(paceSeconds / 60);
    const secs = Math.floor(paceSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderSetValue = (set: WorkoutSet, kind: ExerciseKind, index: number) => {
    const isDuration = isDurationBased(kind);
    const hasWeight = usesWeight(kind);
    const isCardio = kind === 'Cardio';
    
    // Collect PR badges
    const badges: string[] = [];
    if (set.is_weight_pr) badges.push('WEIGHT');
    if (set.is_reps_pr) badges.push('REPS');
    if (set.is_volume_pr) badges.push('VOL.');
    if (set.is_duration_pr) badges.push('DURATION');
    
    // Cardio: show distance, time, and pace
    if (isCardio) {
      const duration = set.duration || 0;
      const distance = set.distance || 0;
      const pace = formatPace(duration, distance);
      
      return (
        <View style={styles.setRow}>
          <Text style={styles.setIndex}>{index + 1}</Text>
          <View style={styles.cardioSetValue}>
            {distance > 0 && (
              <Text style={styles.setValue}>{distance} km</Text>
            )}
            <Text style={styles.setValueSecondary}>{formatDuration(duration)}</Text>
            {distance > 0 && (
              <Text style={styles.setValuePace}>{pace}/km</Text>
            )}
          </View>
          {badges.length > 0 && (
            <View style={styles.badgesContainer}>
              {badges.map(renderPRBadge)}
            </View>
          )}
        </View>
      );
    } else if (isDuration) {
      // Duration only (non-cardio timed exercises like planks)
      const duration = set.duration || 0;
      return (
        <View style={styles.setRow}>
          <Text style={styles.setIndex}>{index + 1}</Text>
          <Text style={styles.setValue}>{formatDuration(duration)}</Text>
          {badges.length > 0 && (
            <View style={styles.badgesContainer}>
              {badges.map(renderPRBadge)}
            </View>
          )}
        </View>
      );
    } else if (hasWeight && set.weight && set.weight > 0) {
      return (
        <View style={styles.setRow}>
          <Text style={styles.setIndex}>{index + 1}</Text>
          <Text style={styles.setValue}>{set.weight} kg × {set.reps || 0}</Text>
          {badges.length > 0 && (
            <View style={styles.badgesContainer}>
              {badges.map(renderPRBadge)}
            </View>
          )}
        </View>
      );
    } else {
      return (
        <View style={styles.setRow}>
          <Text style={styles.setIndex}>{index + 1}</Text>
          <Text style={styles.setValue}>{set.reps || 0} reps</Text>
          {badges.length > 0 && (
            <View style={styles.badgesContainer}>
              {badges.map(renderPRBadge)}
            </View>
          )}
        </View>
      );
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (!summary) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Workout not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Workout</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary Section */}
        <View style={styles.summarySection}>
          <Text style={styles.workoutTitle}>{summary.name || 'Workout'}</Text>
          <Text style={styles.workoutDate}>{formatWorkoutDate(summary.started_at)}</Text>
          
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Ionicons name="time-outline" size={20} color="#007AFF" />
              <Text style={styles.metricValue}>{formatWorkoutDuration(summary.duration_seconds)}</Text>
            </View>
            
            <View style={styles.metricItem}>
              <Ionicons name="barbell-outline" size={20} color="#007AFF" />
              <Text style={styles.metricValue}>{Math.round(summary.total_volume_kg)} kg</Text>
            </View>
            
            <View style={styles.metricItem}>
              <Ionicons name="trophy-outline" size={20} color="#FFD700" />
              <Text style={styles.metricValue}>{summary.pr_count} PRs</Text>
            </View>
          </View>

          {/* View Routine Button */}
          {routine && (
            <TouchableOpacity 
              style={styles.viewRoutineButton}
              onPress={() => setShowRoutineModal(true)}
            >
              <Ionicons name="list-outline" size={20} color="#007AFF" />
              <Text style={styles.viewRoutineText}>View Routine</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Exercise Summary List (2-column) */}
        <View style={styles.exercisesSummarySection}>
          <Text style={styles.sectionTitle}>Exercises</Text>
          
          <View style={styles.summaryTable}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>Exercise</Text>
              <Text style={styles.tableHeaderText}>Best Set</Text>
            </View>
            
            {summary.exercises.map((ex, idx) => (
              <View key={ex.exercise_id + idx} style={styles.summaryRow}>
                <Text style={styles.exerciseName} numberOfLines={1}>
                  {ex.set_count} × {ex.name}
                </Text>
                <Text style={styles.bestSet}>{ex.best_set_display}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Toggle Full Detail */}
        <TouchableOpacity 
          style={styles.toggleDetailButton}
          onPress={() => setShowFullDetail(!showFullDetail)}
        >
          <Text style={styles.toggleDetailText}>
            {showFullDetail ? 'Hide Set Details' : 'Show Set Details'}
          </Text>
          <Ionicons 
            name={showFullDetail ? 'chevron-up' : 'chevron-down'} 
            size={20} 
            color="#007AFF" 
          />
        </TouchableOpacity>

        {/* Full Exercise Detail */}
        {showFullDetail && (
          <View style={styles.fullDetailSection}>
            {exercisesWithSets.map((exercise, exIdx) => (
              <View key={exercise.exercise_id + exIdx} style={styles.exerciseCard}>
                <View style={styles.exerciseHeader}>
                  <View style={styles.exerciseTitleContainer}>
                    <Text style={styles.exerciseTitle}>{exercise.name}</Text>
                    <Text style={styles.exerciseEquipment}>
                      ({getEquipmentLabel(exercise.exercise_kind)})
                    </Text>
                  </View>
                  {exercise.estimated_1rm && exercise.estimated_1rm > 0 && (
                    <Text style={styles.oneRmText}>
                      1RM: {Math.round(exercise.estimated_1rm)} kg
                    </Text>
                  )}
                </View>
                
                <View style={styles.setsContainer}>
                  {exercise.sets.map((set, setIdx) => (
                    <View key={setIdx}>
                      {renderSetValue(set, exercise.exercise_kind, setIdx)}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
        
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Routine Detail Modal */}
      <RoutineDetailModal
        visible={showRoutineModal}
        routine={routine}
        onClose={() => setShowRoutineModal(false)}
        onStartWorkout={(routine) => {
          setShowRoutineModal(false);
          // Navigate to workout tab to start workout from this routine
          router.push({
            pathname: '/(tabs)/workout',
          });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#8E8E93',
    marginBottom: 16,
  },
  backButton: {
    padding: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  headerBackButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  summarySection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 8,
  },
  workoutTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  workoutDate: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  metricItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  exercisesSummarySection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  summaryTable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  tableHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  exerciseName: {
    fontSize: 15,
    color: '#1C1C1E',
    flex: 1,
    marginRight: 12,
  },
  bestSet: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
  },
  toggleDetailButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    marginBottom: 8,
    gap: 8,
  },
  toggleDetailText: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '500',
  },
  fullDetailSection: {
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  exerciseCard: {
    marginBottom: 24,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  exerciseTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  exerciseTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  exerciseEquipment: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  oneRmText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  setsContainer: {
    gap: 8,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  setIndex: {
    width: 24,
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
  },
  setValue: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '500',
    flex: 1,
  },
  cardioSetValue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  setValueSecondary: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  setValuePace: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  badgesContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  prBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  prBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  bottomSpacer: {
    height: 100,
  },
});
