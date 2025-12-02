import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  FlatList,
  Image,
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useWorkoutStore } from '../store/workoutStore';
import Button from './Button';
import DurationInput from './DurationInput';
import DecimalInput from './DecimalInput';
import SetRowInput, { SetHeader } from './SetRowInput';
import CreateExerciseModal from './CreateExerciseModal';
import ExerciseDetailModal from './ExerciseDetailModal';
import ExercisePickerModal from './ExercisePickerModal';
import WorkoutCompleteModal from './WorkoutCompleteModal';
import api from '../utils/api';
import { Exercise, WorkoutExercise, WorkoutSet, getExerciseFields } from '../types';

interface WorkoutSummaryData {
  name: string;
  date: Date;
  duration: number;
  totalVolume: number;
  prCount: number;
  exerciseCount: number;
  exercises: Array<{
    name: string;
    sets: number;
    bestSet: string;
  }>;
  workoutNumber: number;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLLAPSED_HEIGHT = 80;

interface ActiveWorkoutSheetProps {
  onFinishWorkout: () => void;
  initialExpanded?: boolean;
}

export default function ActiveWorkoutSheet({ onFinishWorkout, initialExpanded = true }: ActiveWorkoutSheetProps) {
  const insets = useSafeAreaInsets();
  
  const { activeWorkout, updateWorkout, updateWorkoutName, updateWorkoutNotes, endWorkout, workoutStartTime } = useWorkoutStore();
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const isExpandedRef = useRef(initialExpanded); // Ref to track current expanded state
  const [showMenu, setShowMenu] = useState(false);
  const [showDescription, setShowDescription] = useState(!!activeWorkout?.notes);
  const [exerciseDetails, setExerciseDetails] = useState<{ [key: string]: Exercise }>({});
  const [timer, setTimer] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const [showExerciseDetail, setShowExerciseDetail] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [showWorkoutComplete, setShowWorkoutComplete] = useState(false);
  const [workoutSummary, setWorkoutSummary] = useState<WorkoutSummaryData | null>(null);
  
  // Calculate the maximum height for expanded state
  // Screen height minus top safe area minus tab bar (60px) minus bottom safe area
  // Extra 40px at top to avoid system gesture conflicts
  const maxExpandedHeight = SCREEN_HEIGHT - insets.top - 100 - insets.bottom;
  
  const animatedHeight = useRef(new Animated.Value(initialExpanded ? maxExpandedHeight : COLLAPSED_HEIGHT)).current;

  const exercises = activeWorkout?.exercises || [];

  // Pan responder for drag gesture - use ref for isExpanded to avoid stale closure
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (!isExpandedRef.current && gestureState.dy < -20) {
          expand();
        } else if (isExpandedRef.current && gestureState.dy > 20) {
          collapse();
        }
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const expand = () => {
    Animated.spring(animatedHeight, {
      toValue: maxExpandedHeight,
      useNativeDriver: false,
      friction: 10,
    }).start();
    setIsExpanded(true);
    isExpandedRef.current = true;
  };

  const collapse = () => {
    Animated.spring(animatedHeight, {
      toValue: COLLAPSED_HEIGHT,
      useNativeDriver: false,
      friction: 10,
    }).start();
    setIsExpanded(false);
    isExpandedRef.current = false;
  };

  const toggleExpand = () => {
    if (isExpanded) {
      collapse();
    } else {
      expand();
    }
  };

  // Update height when initialExpanded changes
  useEffect(() => {
    if (initialExpanded) {
      expand();
    }
  }, [initialExpanded]);
  useEffect(() => {
    if (!workoutStartTime) return;

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - workoutStartTime) / 1000);
      setTimer(elapsed);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [workoutStartTime]);

  // Load exercise details when exercises change
  useEffect(() => {
    loadExerciseDetails();
  }, [activeWorkout?.exercises]);

  const loadExerciseDetails = async () => {
    if (!activeWorkout) return;

    const details: { [key: string]: Exercise } = {};
    for (const exercise of activeWorkout.exercises) {
      if (!exerciseDetails[exercise.exercise_id]) {
        try {
          const response = await api.get(`/exercises/${exercise.exercise_id}`);
          details[exercise.exercise_id] = response.data;
        } catch (error) {
          console.error('Failed to load exercise details:', error);
        }
      } else {
        details[exercise.exercise_id] = exerciseDetails[exercise.exercise_id];
      }
    }
    setExerciseDetails(details);
  };

  const loadAvailableExercises = async () => {
    try {
      const response = await api.get('/exercises');
      setAvailableExercises(response.data);
    } catch (error) {
      console.error('Failed to load exercises:', error);
    }
  };

  const handleShowExercisePicker = () => {
    setShowExercisePicker(true);
  };

  const handleAddExerciseToWorkout = async (exercise: Exercise) => {
    console.log('Adding exercise:', exercise.id, exercise.name);
    
    const newExercise: WorkoutExercise = {
      exercise_id: exercise.id,
      order: exercises.length,
      sets: [],
    };

    const newExercises = [...exercises, newExercise];
    updateWorkout(newExercises);
    
    // Add to local exercise details
    setExerciseDetails(prev => ({
      ...prev,
      [exercise.id]: exercise
    }));
    
    setShowExercisePicker(false);
  };

  const addSet = (exerciseIndex: number) => {
    const exercise = exercises[exerciseIndex];
    const detail = exerciseDetails[exercise.exercise_id];
    const fields = getExerciseFields(detail?.exercise_kind || 'Barbell');
    
    const newSet: WorkoutSet = { is_warmup: false };
    if (fields.includes('weight')) newSet.weight = 0;
    if (fields.includes('reps')) newSet.reps = 0;
    if (fields.includes('distance')) newSet.distance = 0;
    if (fields.includes('duration')) newSet.duration = 0;
    if (fields.includes('calories')) newSet.calories = 0;

    const newExercises = [...exercises];
    newExercises[exerciseIndex] = {
      ...exercise,
      sets: [...exercise.sets, newSet],
    };
    updateWorkout(newExercises);
  };

  const updateSet = (exerciseIndex: number, setIndex: number, field: string, value: any) => {
    const newExercises = [...exercises];
    newExercises[exerciseIndex] = {
      ...newExercises[exerciseIndex],
      sets: newExercises[exerciseIndex].sets.map((set, i) =>
        i === setIndex ? { ...set, [field]: value } : set
      ),
    };
    updateWorkout(newExercises);
  };

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    const newExercises = [...exercises];
    newExercises[exerciseIndex] = {
      ...newExercises[exerciseIndex],
      sets: newExercises[exerciseIndex].sets.filter((_, i) => i !== setIndex),
    };
    updateWorkout(newExercises);
  };

  const removeExercise = (exerciseIndex: number) => {
    const exerciseName = exerciseDetails[exercises[exerciseIndex]?.exercise_id]?.name || 'this exercise';
    Alert.alert(
      'Delete Exercise',
      `Are you sure you want to remove ${exerciseName} from this workout?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            const newExercises = exercises.filter((_, i) => i !== exerciseIndex);
            updateWorkout(newExercises);
          }
        },
      ]
    );
  };

  // Render the delete action for swipeable sets
  const renderSetDeleteAction = () => {
    return (
      <View style={styles.deleteSetAction}>
        <Ionicons name="trash" size={20} color="#FFFFFF" />
      </View>
    );
  };

  const handleSaveAndFinish = async () => {
    if (!activeWorkout) return;

    // Check for uncompleted sets
    let uncompletedSetCount = 0;
    exercises.forEach(ex => {
      ex.sets.forEach(set => {
        if (!set.completed) {
          uncompletedSetCount++;
        }
      });
    });

    if (uncompletedSetCount > 0) {
      Alert.alert(
        'Uncompleted Sets',
        `You have ${uncompletedSetCount} uncompleted set${uncompletedSetCount > 1 ? 's' : ''}. These will be removed. Are you sure you want to finish?`,
        [
          { text: 'No', style: 'cancel' },
          { 
            text: 'Yes, Finish', 
            style: 'destructive',
            onPress: () => saveWorkout(true)
          },
        ]
      );
    } else {
      saveWorkout(false);
    }
  };

  const saveWorkout = async (removeUncompleted: boolean) => {
    if (!activeWorkout) return;

    // Filter out uncompleted sets if requested
    let exercisesToSave = exercises;
    if (removeUncompleted) {
      exercisesToSave = exercises.map(ex => ({
        ...ex,
        sets: ex.sets.filter(set => set.completed)
      })).filter(ex => ex.sets.length > 0); // Remove exercises with no completed sets
    }

    try {
      setSaving(true);
      // Use PUT instead of PATCH - backend requires PUT
      await api.put(`/workouts/${activeWorkout.id}`, {
        exercises: exercisesToSave,
        name: activeWorkout.name,
        notes: activeWorkout.notes,
        status: 'completed',
        ended_at: new Date().toISOString(),
        duration: timer,
      });
      
      // Get workout count for summary
      let workoutNumber = 1;
      try {
        const countRes = await api.get('/workouts/count');
        workoutNumber = countRes.data.count;
      } catch (e) {
        console.log('Could not fetch workout count');
      }
      
      // Build exercise summaries (use saved exercises, not original)
      const exerciseSummaries = exercisesToSave.map(ex => {
        const detail = exerciseDetails[ex.exercise_id];
        const sets = ex.sets;
        let bestSet = '';
        
        // Determine best set based on exercise type
        if (detail?.exercise_kind === 'Cardio') {
          // For cardio, show best distance or longest time
          const bestDistanceSet = sets.reduce((best, set) => 
            (set.distance || 0) > (best.distance || 0) ? set : best, sets[0] || {});
          if (bestDistanceSet?.distance) {
            bestSet = `${bestDistanceSet.distance} km`;
          } else if (bestDistanceSet?.duration) {
            const mins = Math.floor((bestDistanceSet.duration || 0) / 60);
            bestSet = `${mins}m`;
          }
        } else if (detail?.exercise_kind && ['Plank', 'Static Hold'].includes(detail.exercise_kind)) {
          // Duration-based
          const bestDurationSet = sets.reduce((best, set) => 
            (set.duration || 0) > (best.duration || 0) ? set : best, sets[0] || {});
          const mins = Math.floor((bestDurationSet?.duration || 0) / 60);
          const secs = (bestDurationSet?.duration || 0) % 60;
          bestSet = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        } else {
          // Weight-based - find highest volume set
          const bestWeightSet = sets.reduce((best, set) => {
            const volume = (set.weight || 0) * (set.reps || 0);
            const bestVolume = (best.weight || 0) * (best.reps || 0);
            return volume > bestVolume ? set : best;
          }, sets[0] || {});
          if (bestWeightSet?.weight) {
            bestSet = `${bestWeightSet.weight} kg × ${bestWeightSet.reps || 0}`;
          } else if (bestWeightSet?.reps) {
            bestSet = `${bestWeightSet.reps} reps`;
          }
        }
        
        return {
          name: detail?.name || 'Unknown Exercise',
          sets: sets.length,
          bestSet: bestSet || '-',
        };
      });
      
      // Calculate total volume (only for weight exercises, use saved exercises)
      let totalVolume = 0;
      exercisesToSave.forEach(ex => {
        ex.sets.forEach(set => {
          if (set.weight && set.reps) {
            totalVolume += set.weight * set.reps;
          }
        });
      });
      
      // Build summary data
      const summary: WorkoutSummaryData = {
        name: activeWorkout.name || 'Workout',
        date: new Date(),
        duration: timer,
        totalVolume: totalVolume,
        prCount: 0, // TODO: Could fetch from backend PR endpoint
        exerciseCount: exercises.length,
        exercises: exerciseSummaries,
        workoutNumber: workoutNumber,
      };
      
      setWorkoutSummary(summary);
      collapse();
      setShowWorkoutComplete(true);
      
    } catch (error: any) {
      console.error('Save error:', error.response?.data || error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save workout');
    } finally {
      setSaving(false);
    }
  };
  
  const handleCloseWorkoutComplete = () => {
    setShowWorkoutComplete(false);
    setWorkoutSummary(null);
    endWorkout();
    onFinishWorkout();
  };

  const handleToggleDescription = () => {
    if (showDescription) {
      // Remove description
      updateWorkoutNotes(undefined);
      setShowDescription(false);
    } else {
      // Add description
      setShowDescription(true);
    }
    setShowMenu(false);
  };

  const handleCancelWorkout = () => {
    Alert.alert(
      'Cancel Workout',
      'Are you sure you want to cancel this workout? All progress will be lost.',
      [
        { text: 'Keep Workout', style: 'cancel' },
        { 
          text: 'Cancel Workout', 
          style: 'destructive',
          onPress: () => {
            endWorkout();
            collapse();
          }
        },
      ]
    );
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!activeWorkout) return null;

  return (
    <>
      <Animated.View style={[styles.container, { height: animatedHeight }]}>
        {/* Top Header with drag handle - different content for collapsed vs expanded */}
        <View {...panResponder.panHandlers}>
          <TouchableOpacity 
            style={styles.collapsedHeader} 
            onPress={toggleExpand} 
            activeOpacity={0.9}
            disabled={isExpanded}
          >
            <View style={styles.dragHandle} />
            {!isExpanded ? (
              // Collapsed: show name and timer
              <View style={styles.collapsedContent}>
                <View style={styles.collapsedLeft}>
                  <Ionicons name="barbell" size={24} color="#007AFF" />
                  <Text style={styles.collapsedTitle} numberOfLines={1}>
                    {activeWorkout?.name || 'Workout'}
                  </Text>
                </View>
                <View style={styles.collapsedRight}>
                  <View style={styles.timerBadge}>
                    <Ionicons name="time" size={16} color="#007AFF" />
                    <Text style={styles.timerText}>{formatTime(timer)}</Text>
                  </View>
                </View>
              </View>
            ) : (
              // Expanded: just show Finish button
              <View style={styles.expandedTopBar}>
                <View style={{flex: 1}} />
                <TouchableOpacity 
                  style={styles.finishButton}
                  onPress={handleSaveAndFinish}
                  disabled={saving || exercises.length === 0}
                >
                  <Text style={[
                    styles.finishButtonText,
                    (saving || exercises.length === 0) && styles.finishButtonTextDisabled
                  ]}>
                    {saving ? 'Saving...' : 'Finish'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Expanded Content */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* Row 1: Workout Name + Menu */}
            <View style={styles.nameRow}>
              <Ionicons name="barbell" size={24} color="#007AFF" style={styles.nameBarbell} />
              <TextInput
                style={styles.workoutNameInput}
                value={activeWorkout?.name || ''}
                onChangeText={updateWorkoutName}
                placeholder="Workout Name"
                placeholderTextColor="#8E8E93"
              />
              <TouchableOpacity 
                style={styles.menuButton}
                onPress={() => setShowMenu(!showMenu)}
              >
                <Ionicons name="ellipsis-horizontal" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            {/* Row 2: Date */}
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={18} color="#8E8E93" />
              <Text style={styles.dateText}>
                {new Date(workoutStartTime || Date.now()).toLocaleDateString('en-US', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </Text>
            </View>

            {/* Row 3: Timer */}
            <View style={styles.timerRow}>
              <Ionicons name="time-outline" size={18} color="#007AFF" />
              <Text style={styles.timerTextLarge}>{formatTime(timer)}</Text>
            </View>

            {/* Dropdown Menu */}
            {showMenu && (
              <View style={styles.menuDropdown}>
                <TouchableOpacity style={styles.menuItem} onPress={handleToggleDescription}>
                  <Ionicons 
                    name={showDescription ? "remove-circle-outline" : "add-circle-outline"} 
                    size={20} 
                    color="#1C1C1E" 
                  />
                  <Text style={styles.menuItemText}>
                    {showDescription ? 'Remove Description' : 'Add Description'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Description Input */}
            {showDescription && (
              <View style={styles.descriptionContainer}>
                <TextInput
                  style={styles.descriptionInput}
                  value={activeWorkout?.notes || ''}
                  onChangeText={updateWorkoutNotes}
                  placeholder="Add workout description..."
                  placeholderTextColor="#8E8E93"
                  multiline
                  numberOfLines={2}
                />
              </View>
            )}

            <ScrollView style={styles.exercisesList} showsVerticalScrollIndicator={false}>
              {exercises.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No exercises added yet</Text>
                </View>
              ) : (
                exercises.map((exercise, exerciseIndex) => {
                  const detail = exerciseDetails[exercise.exercise_id];
                  
                  return (
                    <View key={`${exercise.exercise_id}-${exerciseIndex}`} style={styles.exerciseCard}>
                      <View style={styles.exerciseHeader}>
                        <TouchableOpacity
                          style={styles.exerciseNameContainer}
                          onPress={() => {
                            if (detail) {
                              setSelectedExercise(detail);
                              setShowExerciseDetail(true);
                            }
                          }}
                        >
                          <Text style={styles.exerciseNameClickable}>
                            {detail?.name || 'Loading...'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.exerciseMenuButton}
                          onPress={() => {
                            Alert.alert(
                              detail?.name || 'Exercise',
                              'What would you like to do?',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                { 
                                  text: 'Delete Exercise', 
                                  style: 'destructive',
                                  onPress: () => removeExercise(exerciseIndex)
                                },
                              ]
                            );
                          }}
                        >
                          <Ionicons name="ellipsis-horizontal" size={20} color="#8E8E93" />
                        </TouchableOpacity>
                      </View>

                      {/* Sets */}
                      {exercise.sets.length > 0 && (
                        <View style={styles.setsContainer}>
                          <SetHeader exerciseKind={detail?.exercise_kind || 'Barbell'} showCompleteColumn />
                          
                          {exercise.sets.map((set, setIndex) => (
                            <Swipeable
                              key={setIndex}
                              renderRightActions={renderSetDeleteAction}
                              onSwipeableOpen={(direction) => {
                                if (direction === 'right') {
                                  removeSet(exerciseIndex, setIndex);
                                }
                              }}
                              rightThreshold={40}
                              overshootRight={false}
                              friction={2}
                            >
                              <SetRowInput
                                set={set}
                                setIndex={setIndex}
                                exerciseKind={detail?.exercise_kind || 'Barbell'}
                                onUpdateSet={(field, value) => updateSet(exerciseIndex, setIndex, field, value)}
                                showCompleteButton
                              />
                            </Swipeable>
                          ))}
                        </View>
                      )}

                      <TouchableOpacity style={styles.addSetButton} onPress={() => addSet(exerciseIndex)}>
                        <Ionicons name="add" size={20} color="#007AFF" />
                        <Text style={styles.addSetText}>Add Set</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
              <View style={styles.bottomSpacer} />
            </ScrollView>

            <View style={styles.footer}>
              <Button
                title="Add Exercise"
                onPress={handleShowExercisePicker}
                variant="outline"
                style={styles.addExerciseButton}
              />
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelWorkout}>
                <Text style={styles.cancelButtonText}>Cancel Workout</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>

      {/* Exercise Picker Modal */}
      <ExercisePickerModal
        visible={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelectExercise={handleAddExerciseToWorkout}
        onCreateNew={() => {
          setShowExercisePicker(false);
          setTimeout(() => setShowCreateExercise(true), 300);
        }}
      />

      <CreateExerciseModal
        visible={showCreateExercise}
        onClose={() => setShowCreateExercise(false)}
        onExerciseCreated={() => {
          loadAvailableExercises();
          setShowCreateExercise(false);
        }}
      />

      <ExerciseDetailModal
        visible={showExerciseDetail}
        exercise={selectedExercise}
        onClose={() => {
          setShowExerciseDetail(false);
          setSelectedExercise(null);
        }}
        onExerciseUpdated={loadExerciseDetails}
      />

      <WorkoutCompleteModal
        visible={showWorkoutComplete}
        onClose={handleCloseWorkoutComplete}
        summaryData={workoutSummary}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 60, // Position above the tab bar (60px tab bar height)
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  collapsedHeader: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#D1D1D6',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  collapsedContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  collapsedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  collapsedTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  collapsedRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  timerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
  },
  expandedTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandedContent: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  nameBarbell: {
    marginRight: 12,
  },
  workoutNameInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
    padding: 0,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 8,
  },
  dateText: {
    fontSize: 15,
    color: '#8E8E93',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 8,
  },
  timerTextLarge: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  menuButton: {
    padding: 4,
  },
  menuDropdown: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 100,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: '#1C1C1E',
  },
  descriptionContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  descriptionInput: {
    fontSize: 15,
    color: '#3A3A3C',
    padding: 0,
    minHeight: 40,
  },
  finishButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  finishButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  finishButtonTextDisabled: {
    opacity: 0.5,
  },
  exercisesList: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  exerciseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 0,
    marginBottom: 16,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  exerciseNameContainer: {
    flex: 1,
  },
  exerciseNameClickable: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  exerciseMenuButton: {
    padding: 8,
  },
  setsContainer: {
    marginBottom: 12,
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  addSetText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 6,
  },
  bottomSpacer: {
    height: 100,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  addExerciseButton: {
    marginBottom: 12,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: 16,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  deleteSetAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 50,
    marginBottom: 8,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
});
