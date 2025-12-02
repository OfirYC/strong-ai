import React, { useState, useEffect } from 'react';
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
import Button from '../../components/Button';
import api from '../../utils/api';
import { useWorkoutStore } from '../../store/workoutStore';
import { WorkoutTemplate } from '../../types';
import RoutineDetailModal from '../../components/RoutineDetailModal';

export default function WorkoutScreen() {
  const { activeWorkout, startWorkout, endWorkout } = useWorkoutStore();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<WorkoutTemplate | null>(null);
  const [showRoutineModal, setShowRoutineModal] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const response = await api.get('/templates');
      setTemplates(response.data);
    } catch (error) {
      console.error('Failed to load templates:', error);
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
                  onPress={() => handleStartTemplate(template.id)}
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
});
