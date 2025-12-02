import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { useRouter } from 'expo-router';
import api from '../../utils/api';
import { WorkoutSummary } from '../../types';

interface GroupedWorkouts {
  title: string;
  date: string;
  data: WorkoutSummary[];
}

export default function HistoryScreen() {
  const router = useRouter();
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadWorkouts();
  }, []);

  const loadWorkouts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/workouts/history');
      setWorkouts(response.data);
    } catch (error) {
      console.error('Failed to load workouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWorkouts();
    setRefreshing(false);
  }, []);

  // Group workouts by date
  const groupedWorkouts = React.useMemo((): GroupedWorkouts[] => {
    const groups: { [key: string]: WorkoutSummary[] } = {};
    
    workouts.forEach((workout) => {
      const date = format(parseISO(workout.started_at), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(workout);
    });

    return Object.entries(groups).map(([date, data]) => {
      const parsedDate = parseISO(date);
      let title: string;
      
      if (isToday(parsedDate)) {
        title = 'Today';
      } else if (isYesterday(parsedDate)) {
        title = 'Yesterday';
      } else {
        title = format(parsedDate, 'EEEE, MMM d, yyyy');
      }
      
      return { title, date, data };
    });
  }, [workouts]);

 const formatDuration = (seconds: number): string => {
  const totalMins = Math.round(seconds / 60);

  if (totalMins < 60) {
    return `${totalMins}m`;
  }

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  // pad minutes to always 2 digits (e.g., 1:05)
  const paddedMins = mins.toString().padStart(2, "0");

  return `${hours}h ${paddedMins}m`;
};

  const formatVolume = (kg: number): string => {
    if (kg >= 1000) {
      return `${(kg / 1000).toFixed(1)}k`;
    }
    return `${Math.round(kg)}`;
  };

  const handleWorkoutPress = (workout: WorkoutSummary) => {
    router.push({
      pathname: '/workout-detail',
      params: { workoutId: workout.id }
    });
  };

  const renderWorkoutCard = ({ item }: { item: WorkoutSummary }) => {
    const startTime = format(parseISO(item.started_at), 'h:mm a');
    
    return (
      <TouchableOpacity 
        style={styles.workoutCard}
        onPress={() => handleWorkoutPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleContainer}>
            <Text style={styles.workoutName} numberOfLines={1}>
              {item.name || 'Workout'}
            </Text>
          </View>
          <Text style={styles.workoutTime}>{startTime}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="barbell-outline" size={16} color="#007AFF" />
            <Text style={styles.statText}>{item.exercise_count} exercises</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="layers-outline" size={16} color="#007AFF" />
            <Text style={styles.statText}>{item.set_count} sets</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="fitness-outline" size={16} color="#007AFF" />
            <Text style={styles.statText}>{formatVolume(item.total_volume_kg)} vol</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={16} color="#007AFF" />
            <Text style={styles.statText}>{formatDuration(item.duration_seconds)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: GroupedWorkouts }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
      </View>

      <SectionList
        sections={groupedWorkouts}
        keyExtractor={(item) => item.id}
        renderItem={renderWorkoutCard}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={64} color="#C7C7CC" />
            <Text style={styles.emptyText}>No workouts yet</Text>
            <Text style={styles.emptySubtext}>
              Complete your first workout to see it here
            </Text>
          </View>
        }
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  sectionHeader: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6E6E73',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  workoutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  workoutName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  workoutTime: {
    fontSize: 15,
    color: '#8E8E93',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 13,
    color: '#6E6E73',
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
    color: '#AEAEB2',
    marginTop: 8,
    textAlign: 'center',
  },
});
