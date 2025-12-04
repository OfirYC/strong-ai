import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import Button from '../../components/Button';
import api from '../../utils/api';
import { useWorkoutStore } from '../../store/workoutStore';
import { WorkoutTemplate } from '../../types';
import RoutineDetailModal from '../../components/RoutineDetailModal';
import ScheduleWorkoutModal from '../../components/ScheduleWorkoutModal';

interface PlannedWorkout {
  id: string;
  user_id: string;
  date: string;
  name: string;
  template_id?: string;
  type?: string;
  notes?: string;
  status: 'planned' | 'in_progress' | 'completed' | 'skipped';
  workout_session_id?: string;
  order: number;
  is_recurring: boolean;
  recurrence_type?: string;
  recurrence_days?: number[];
  recurrence_end_date?: string;
  recurrence_parent_id?: string;
}

export default function WorkoutScreen() {
  const { activeWorkout, startWorkout, endWorkout } = useWorkoutStore();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [todaysWorkouts, setTodaysWorkouts] = useState<PlannedWorkout[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<WorkoutTemplate | null>(null);
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Load templates and today's workouts on mount
  useEffect(() => {
    loadTemplates();
    loadTodaysWorkouts();
  }, []);

  // Reload data whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadTemplates();
      loadTodaysWorkouts();
    }, [])
  );

  const loadTemplates = async () => {
    try {
      const response = await api.get('/templates');
      setTemplates(response.data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadTodaysWorkouts = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const response = await api.get(`/planned-workouts?date=${today}`);
      setTodaysWorkouts(response.data);
    } catch (error) {
      console.error('Failed to load today\'s workouts:', error);
    }
  };

  const handleStartEmptyWorkout = async () => {
    if (activeWorkout) {
      Alert.alert(
        'Active Workout',
        'You already have an Active Workout. Do you want to discard it and start a new one?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Discard & Start New', 
            style: 'destructive',
            onPress: async () => {
              endWorkout();
              await createNewWorkout();
            }
          },
        ]
      );
      return;
    }
    await createNewWorkout();
  };

  const createNewWorkout = async () => {
    try {
      setLoading(true);
      const response = await api.post('/workouts', { notes: '' });
      startWorkout(response.data);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to start workout');
    } finally {
      setLoading(false);
    }
  };

  const handleStartTemplate = (template: WorkoutTemplate) => {
    setSelectedRoutine(template);
    setShowRoutineModal(true);
  };

  const handleStartWorkoutFromRoutine = async (routine: WorkoutTemplate) => {
    if (activeWorkout) {
      Alert.alert(
        'Active Workout',
        'You already have an Active Workout. Do you want to discard it and start a new one?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Discard & Start New', 
            style: 'destructive',
            onPress: async () => {
              endWorkout();
              await createTemplateWorkout(routine.id);
            }
          },
        ]
      );
      return;
    }
    await createTemplateWorkout(routine.id);
  };

  const createTemplateWorkout = async (templateId: string) => {
    try {
      setLoading(true);
      const response = await api.post('/workouts', { template_id: templateId });
      startWorkout(response.data);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to start workout');
    } finally {
      setLoading(false);
    }
  };

  const handleStartPlannedWorkout = async (plannedWorkout: PlannedWorkout) => {
    // If already in progress, resume it
    if (plannedWorkout.status === 'in_progress' && plannedWorkout.workout_session_id) {
      try {
        const response = await api.get(`/workouts/${plannedWorkout.workout_session_id}`);
        startWorkout(response.data);
        return;
      } catch (error) {
        console.error('Failed to resume workout:', error);
      }
    }

    // If completed or skipped, don't allow starting again
    if (plannedWorkout.status === 'completed' || plannedWorkout.status === 'skipped') {
      return;
    }

    // Check for active workout
    if (activeWorkout) {
      Alert.alert(
        'Active Workout',
        'You already have an Active Workout. Do you want to discard it and start a new one?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Discard & Start New', 
            style: 'destructive',
            onPress: async () => {
              endWorkout();
              await createPlannedWorkoutSession(plannedWorkout);
            }
          },
        ]
      );
      return;
    }

    await createPlannedWorkoutSession(plannedWorkout);
  };

  const createPlannedWorkoutSession = async (plannedWorkout: PlannedWorkout) => {
    try {
      setLoading(true);
      const payload: any = { 
        planned_workout_id: plannedWorkout.id,
        name: plannedWorkout.name
      };
      
      // If it has a template, use it
      if (plannedWorkout.template_id) {
        payload.template_id = plannedWorkout.template_id;
      }
      
      const response = await api.post('/workouts', payload);
      startWorkout(response.data);
      
      // Reload today's workouts to reflect status change
      await loadTodaysWorkouts();
    } catch (error: any) {
      Alert.alert('Error', 'Failed to start workout');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'completed':
        return { backgroundColor: '#34C759', color: '#FFFFFF' };
      case 'in_progress':
        return { backgroundColor: '#FF9500', color: '#FFFFFF' };
      case 'skipped':
        return { backgroundColor: '#8E8E93', color: '#FFFFFF' };
      default:
        return { backgroundColor: '#007AFF', color: '#FFFFFF' };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return 'checkmark-circle';
      case 'in_progress':
        return 'play-circle';
      case 'skipped':
        return 'close-circle';
      default:
        return 'time-outline';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        contentContainerStyle={[
          styles.scrollContent,
          activeWorkout && styles.scrollContentWithSheet
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Start Workout</Text>
        </View>

        {/* Today's Workouts Section */}
        {todaysWorkouts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Workouts</Text>
            {todaysWorkouts.map((plannedWorkout) => (
              <TouchableOpacity
                key={plannedWorkout.id}
                style={[
                  styles.plannedWorkoutCard,
                  plannedWorkout.status === 'completed' && styles.completedCard,
                  plannedWorkout.status === 'skipped' && styles.skippedCard,
                ]}
                onPress={() => handleStartPlannedWorkout(plannedWorkout)}
                disabled={plannedWorkout.status === 'completed' || plannedWorkout.status === 'skipped'}
              >
                <View style={styles.plannedWorkoutContent}>
                  <View style={styles.plannedWorkoutHeader}>
                    <Text style={styles.plannedWorkoutName}>{plannedWorkout.name}</Text>
                    <View style={[styles.statusBadge, getStatusBadgeStyle(plannedWorkout.status)]}>
                      <Ionicons 
                        name={getStatusIcon(plannedWorkout.status) as any} 
                        size={14} 
                        color={getStatusBadgeStyle(plannedWorkout.status).color}
                        style={styles.statusIcon}
                      />
                      <Text style={[styles.statusText, { color: getStatusBadgeStyle(plannedWorkout.status).color }]}>
                        {plannedWorkout.status.replace('_', ' ')}
                      </Text>
                    </View>
                  </View>
                  {plannedWorkout.notes && (
                    <Text style={styles.plannedWorkoutNotes}>{plannedWorkout.notes}</Text>
                  )}
                  {plannedWorkout.type && (
                    <Text style={styles.plannedWorkoutType}>{plannedWorkout.type}</Text>
                  )}
                </View>
                {plannedWorkout.status === 'planned' && (
                  <Ionicons name="play-circle-outline" size={32} color="#007AFF" />
                )}
                {plannedWorkout.status === 'in_progress' && (
                  <Ionicons name="play-circle" size={32} color="#FF9500" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Button
          title="Quick Start"
          onPress={handleStartEmptyWorkout}
          loading={loading}
          style={styles.quickStartButton}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Routines</Text>
          {templates.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="list-outline" size={64} color="#3A3A3C" />
              <Text style={styles.emptyText}>No routines yet</Text>
              <Text style={styles.emptySubtext}>
                Create a routine in the Routines tab
              </Text>
            </View>
          ) : (
            templates.map((template) => (
              <TouchableOpacity
                key={template.id}
                style={styles.templateCard}
                onPress={() => handleStartTemplate(template)}
              >
                <View style={styles.templateInfo}>
                  <Text style={styles.templateName}>{template.name}</Text>
                  <Text style={styles.templateDetail}>
                    {template.exercises.length} exercises
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#8E8E93" />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      <RoutineDetailModal
        visible={showRoutineModal}
        routine={selectedRoutine}
        onClose={() => setShowRoutineModal(false)}
        onStartWorkout={handleStartWorkoutFromRoutine}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  scrollContentWithSheet: {
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  quickStartButton: {
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  templateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  templateDetail: {
    fontSize: 14,
    color: '#8E8E93',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#636366',
    marginTop: 8,
    textAlign: 'center',
  },
  plannedWorkoutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  completedCard: {
    opacity: 0.6,
    borderColor: '#34C759',
  },
  skippedCard: {
    opacity: 0.5,
    borderColor: '#8E8E93',
  },
  plannedWorkoutContent: {
    flex: 1,
    marginRight: 12,
  },
  plannedWorkoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  plannedWorkoutName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusIcon: {
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  plannedWorkoutNotes: {
    fontSize: 14,
    color: '#636366',
    marginBottom: 4,
  },
  plannedWorkoutType: {
    fontSize: 12,
    color: '#8E8E93',
    textTransform: 'capitalize',
  },
});
