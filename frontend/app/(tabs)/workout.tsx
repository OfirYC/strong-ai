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
import { useRouter } from 'expo-router';
import Button from '../../components/Button';
import api from '../../utils/api';
import { useWorkoutStore } from '../../store/workoutStore';
import { WorkoutTemplate } from '../../types';

export default function WorkoutScreen() {
  const router = useRouter();
  const { activeWorkout, startWorkout } = useWorkoutStore();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(false);

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
    try {
      setLoading(true);
      const response = await api.post('/workouts', { notes: '' });
      startWorkout(response.data);
      router.push('/active-workout');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to start workout');
    } finally {
      setLoading(false);
    }
  };

  const handleStartTemplate = async (templateId: string) => {
    try {
      setLoading(true);
      const response = await api.post('/workouts', { template_id: templateId });
      startWorkout(response.data);
      router.push('/active-workout');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to start workout');
    } finally {
      setLoading(false);
    }
  };

  if (activeWorkout) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Workout in Progress</Text>
        </View>
        <View style={styles.activeWorkoutCard}>
          <Ionicons name="barbell" size={48} color="#4A90E2" />
          <Text style={styles.activeWorkoutText}>
            You have an active workout
          </Text>
          <Button
            title="Continue Workout"
            onPress={() => router.push('/active-workout')}
            style={styles.continueButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
    padding: 16,
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
  activeWorkoutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    margin: 16,
    alignItems: 'center',
  },
  activeWorkoutText: {
    fontSize: 18,
    color: '#1C1C1E',
    marginTop: 16,
    marginBottom: 24,
  },
  continueButton: {
    width: '100%',
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
