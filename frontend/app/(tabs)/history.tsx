import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import api from '../../utils/api';
import { WorkoutSession } from '../../types';

export default function HistoryScreen() {
  const [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadWorkouts();
  }, []);

  const loadWorkouts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/workouts');
      setWorkouts(response.data);
    } catch (error) {
      console.error('Failed to load workouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateWorkoutStats = (workout: WorkoutSession) => {
    let totalSets = 0;
    let totalVolume = 0;

    workout.exercises.forEach((exercise) => {
      totalSets += exercise.sets.length;
      exercise.sets.forEach((set) => {
        if (!set.is_warmup) {
          totalVolume += set.weight * set.reps;
        }
      });
    });

    return { totalSets, totalVolume };
  };

  const renderWorkout = ({ item }: { item: WorkoutSession }) => {
    const stats = calculateWorkoutStats(item);
    const duration = item.ended_at
      ? Math.round(
          (new Date(item.ended_at).getTime() -
            new Date(item.started_at).getTime()) /
            60000
        )
      : null;

    return (
      <TouchableOpacity style={styles.workoutCard}>
        <View style={styles.workoutHeader}>
          <Text style={styles.workoutDate}>
            {format(new Date(item.started_at), 'MMM d, yyyy')}
          </Text>
          <Text style={styles.workoutTime}>
            {format(new Date(item.started_at), 'h:mm a')}
          </Text>
        </View>

        <View style={styles.workoutStats}>
          <View style={styles.statItem}>
            <Ionicons name="barbell" size={20} color="#4A90E2" />
            <Text style={styles.statValue}>{item.exercises.length}</Text>
            <Text style={styles.statLabel}>exercises</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="list" size={20} color="#4A90E2" />
            <Text style={styles.statValue}>{stats.totalSets}</Text>
            <Text style={styles.statLabel}>sets</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="fitness" size={20} color="#4A90E2" />
            <Text style={styles.statValue}>
              {(stats.totalVolume / 1000).toFixed(1)}k
            </Text>
            <Text style={styles.statLabel}>volume</Text>
          </View>

          {duration && (
            <View style={styles.statItem}>
              <Ionicons name="time" size={20} color="#4A90E2" />
              <Text style={styles.statValue}>{duration}</Text>
              <Text style={styles.statLabel}>mins</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
      </View>

      <FlatList
        data={workouts}
        keyExtractor={(item) => item.id}
        renderItem={renderWorkout}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={loadWorkouts}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={64} color="#3A3A3C" />
            <Text style={styles.emptyText}>No workouts yet</Text>
            <Text style={styles.emptySubtext}>
              Start your first workout to see it here
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    padding: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  workoutCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  workoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  workoutDate: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  workoutTime: {
    fontSize: 14,
    color: '#8E8E93',
  },
  workoutStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
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
  },
});
