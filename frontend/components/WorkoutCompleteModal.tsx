import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ExerciseSummary {
  name: string;
  sets: number;
  bestSet: string;
}

interface WorkoutSummaryData {
  name: string;
  date: Date;
  duration: number; // in seconds
  totalVolume: number; // in kg
  prCount: number;
  exerciseCount: number;
  exercises: ExerciseSummary[];
  workoutNumber: number;
}

interface WorkoutCompleteModalProps {
  visible: boolean;
  onClose: () => void;
  summaryData: WorkoutSummaryData | null;
}

export default function WorkoutCompleteModal({ visible, onClose, summaryData }: WorkoutCompleteModalProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const starsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Animate in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // After modal appears, animate stars
        Animated.spring(starsAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }).start();
      });
    } else {
      // Reset animations
      slideAnim.setValue(SCREEN_HEIGHT);
      fadeAnim.setValue(0);
      starsAnim.setValue(0);
    }
  }, [visible]);

  const handleClose = () => {
    // Animate out
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatDate = (date: Date): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const formatVolume = (kg: number): string => {
    if (kg >= 1000) {
      return `${(kg / 1000).toFixed(1)}t`;
    }
    return `${kg} kg`;
  };

  const getOrdinalSuffix = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  if (!summaryData) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View 
          style={[
            styles.container,
            { 
              transform: [{ translateY: slideAnim }],
              paddingTop: insets.top + 10,
              paddingBottom: insets.bottom + 20,
            }
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={24} color="#1C1C1E" />
            </TouchableOpacity>
            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.shareButton}>
                <Ionicons name="share-outline" size={24} color="#007AFF" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView 
            style={styles.content} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentContainer}
          >
            {/* Stars and Title */}
            <Animated.View 
              style={[
                styles.celebrationContainer,
                {
                  transform: [
                    { scale: starsAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1],
                    })},
                  ],
                  opacity: starsAnim,
                }
              ]}
            >
              <View style={styles.starsRow}>
                <Text style={[styles.star, styles.starSmall]}>✦</Text>
                <Text style={[styles.star, styles.starMedium]}>★</Text>
                <Text style={[styles.star, styles.starLarge]}>★</Text>
                <Text style={[styles.star, styles.starMedium]}>★</Text>
                <Text style={[styles.star, styles.starSmall]}>✦</Text>
              </View>
              <Text style={styles.title}>Well Done!</Text>
              <Text style={styles.subtitle}>
                You completed your {getOrdinalSuffix(summaryData.workoutNumber)} workout!
              </Text>
            </Animated.View>

            {/* Workout Summary Card */}
            <View style={styles.summaryCard}>
              <Text style={styles.workoutName}>{summaryData.name || 'Workout'}</Text>
              <Text style={styles.workoutDate}>{formatDate(summaryData.date)}</Text>
              
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="time-outline" size={18} color="#8E8E93" />
                  <Text style={styles.statValue}>{formatDuration(summaryData.duration)}</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="barbell-outline" size={18} color="#8E8E93" />
                  <Text style={styles.statValue}>{formatVolume(summaryData.totalVolume)}</Text>
                </View>
                {summaryData.prCount > 0 && (
                  <View style={styles.statItem}>
                    <Ionicons name="trophy" size={18} color="#FFD700" />
                    <Text style={styles.statValue}>{summaryData.prCount} PRs</Text>
                  </View>
                )}
              </View>

              {/* Exercise List */}
              {summaryData.exercises.length > 0 && (
                <View style={styles.exerciseList}>
                  <View style={styles.exerciseHeader}>
                    <Text style={styles.exerciseHeaderText}>Exercise</Text>
                    <Text style={styles.exerciseHeaderText}>Best Set</Text>
                  </View>
                  {summaryData.exercises.map((exercise, index) => (
                    <View key={index} style={styles.exerciseRow}>
                      <Text style={styles.exerciseName}>
                        {exercise.sets} × {exercise.name}
                      </Text>
                      <Text style={styles.exerciseBestSet}>{exercise.bestSet}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Personal Records Button */}
            {summaryData.prCount > 0 && (
              <TouchableOpacity style={styles.prButton}>
                <Ionicons name="trophy" size={20} color="#1C1C1E" />
                <Text style={styles.prButtonText}>
                  {summaryData.prCount} Personal Record{summaryData.prCount > 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  shareButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5F0FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  celebrationContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  star: {
    color: '#FFD700',
  },
  starSmall: {
    fontSize: 16,
    opacity: 0.6,
  },
  starMedium: {
    fontSize: 28,
  },
  starLarge: {
    fontSize: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    color: '#8E8E93',
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  workoutName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  workoutDate: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  exerciseList: {
    gap: 12,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  exerciseHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseName: {
    fontSize: 15,
    color: '#1C1C1E',
    flex: 1,
  },
  exerciseBestSet: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
  },
  prButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  prButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
});
