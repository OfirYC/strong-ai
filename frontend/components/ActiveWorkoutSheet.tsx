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
import CreateExerciseModal from './CreateExerciseModal';
import ExerciseDetailModal from './ExerciseDetailModal';
import api from '../utils/api';
import { Exercise, WorkoutExercise, WorkoutSet, getExerciseFields } from '../types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLLAPSED_HEIGHT = 80;

interface ActiveWorkoutSheetProps {
  onFinishWorkout: () => void;
  initialExpanded?: boolean;
}

export default function ActiveWorkoutSheet({ onFinishWorkout, initialExpanded = false }: ActiveWorkoutSheetProps) {
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
    loadAvailableExercises();
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

  // Helper to handle decimal input - preserves decimal point during typing
  const handleDecimalInput = (text: string, callback: (value: number) => void) => {
    // Allow empty input, numbers, and decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    // Only allow one decimal point
    const parts = cleaned.split('.');
    const formatted = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
    // Parse to number, preserving 0 for empty input
    const numValue = formatted === '' || formatted === '.' ? 0 : parseFloat(formatted);
    callback(isNaN(numValue) ? 0 : numValue);
  };

  // Render the delete action for swipeable
  const renderRightActions = (exerciseIndex: number) => {
    return (
      <TouchableOpacity 
        style={styles.deleteAction}
        onPress={() => removeExercise(exerciseIndex)}
      >
        <Ionicons name="trash" size={24} color="#FFFFFF" />
        <Text style={styles.deleteActionText}>Delete</Text>
      </TouchableOpacity>
    );
  };

  const handleSaveAndFinish = async () => {
    if (!activeWorkout) return;

    try {
      setSaving(true);
      // Use PUT instead of PATCH - backend requires PUT
      await api.put(`/workouts/${activeWorkout.id}`, {
        exercises: exercises,
        name: activeWorkout.name,
        notes: activeWorkout.notes,
        status: 'completed',
        ended_at: new Date().toISOString(),
        duration: timer,
      });
      endWorkout();
      collapse();
      onFinishWorkout();
    } catch (error: any) {
      console.error('Save error:', error.response?.data || error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save workout');
    } finally {
      setSaving(false);
    }
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
                  const fields = getExerciseFields(detail?.exercise_kind || 'Barbell');
                  
                  return (
                    <Swipeable
                      key={`${exercise.exercise_id}-${exerciseIndex}`}
                      renderRightActions={() => renderRightActions(exerciseIndex)}
                      overshootRight={false}
                      friction={2}
                    >
                      <View style={styles.exerciseCard}>
                        <TouchableOpacity
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

                        {/* Sets */}
                        {exercise.sets.length > 0 && (
                          <View style={styles.setsContainer}>
                            <View style={styles.setHeader}>
                              <Text style={styles.setHeaderText}>SET</Text>
                              {fields.includes('weight') && <Text style={styles.setHeaderText}>KG</Text>}
                              {fields.includes('reps') && <Text style={styles.setHeaderText}>REPS</Text>}
                              {fields.includes('duration') && <Text style={styles.setHeaderText}>TIME</Text>}
                              {fields.includes('distance') && <Text style={styles.setHeaderText}>KM</Text>}
                              <Text style={styles.setHeaderText}></Text>
                            </View>
                            
                            {exercise.sets.map((set, setIndex) => (
                              <View key={setIndex} style={styles.setRow}>
                                <Text style={styles.setNumber}>{setIndex + 1}</Text>
                                {fields.includes('weight') && (
                                  <DecimalInput
                                    style={styles.setInput}
                                    value={set.weight || 0}
                                    onChangeValue={(value) => updateSet(exerciseIndex, setIndex, 'weight', value)}
                                    placeholder="0"
                                  />
                                )}
                                {fields.includes('reps') && (
                                  <TextInput
                                    style={styles.setInput}
                                    value={set.reps?.toString() || '0'}
                                    onChangeText={(value) => updateSet(exerciseIndex, setIndex, 'reps', parseInt(value) || 0)}
                                    keyboardType="number-pad"
                                    placeholder="0"
                                  />
                                )}
                                {fields.includes('duration') && (
                                  <DurationInput
                                    value={set.duration || 0}
                                    onChangeValue={(value) => updateSet(exerciseIndex, setIndex, 'duration', value)}
                                    style={styles.durationInput}
                                  />
                                )}
                                {fields.includes('distance') && (
                                  <DecimalInput
                                    style={styles.setInput}
                                    value={set.distance || 0}
                                    onChangeValue={(value) => updateSet(exerciseIndex, setIndex, 'distance', value)}
                                    placeholder="0"
                                  />
                                )}
                                <TouchableOpacity onPress={() => removeSet(exerciseIndex, setIndex)}>
                                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        )}

                        <TouchableOpacity style={styles.addSetButton} onPress={() => addSet(exerciseIndex)}>
                          <Ionicons name="add" size={20} color="#007AFF" />
                          <Text style={styles.addSetText}>Add Set</Text>
                        </TouchableOpacity>
                      </View>
                    </Swipeable>
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
      <Modal
        visible={showExercisePicker}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowExercisePicker(false)}>
              <Ionicons name="close" size={28} color="#1C1C1E" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Exercise</Text>
            <TouchableOpacity onPress={() => {
              setShowExercisePicker(false);
              setTimeout(() => setShowCreateExercise(true), 300);
            }}>
              <Text style={styles.newExerciseText}>+ New</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={availableExercises}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.exerciseOption}
                onPress={() => handleAddExerciseToWorkout(item)}
              >
                <View style={styles.exerciseOptionImageContainer}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.exerciseOptionImage} />
                  ) : (
                    <View style={styles.exerciseOptionPlaceholder}>
                      <Ionicons name="barbell" size={20} color="#8E8E93" />
                    </View>
                  )}
                </View>
                <View style={styles.exerciseOptionInfo}>
                  <Text style={styles.exerciseOptionName}>{item.name}</Text>
                  <Text style={styles.exerciseOptionDetail}>
                    {item.exercise_kind} • {item.primary_body_parts.join(', ')}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.exerciseList}
          />
        </SafeAreaView>
      </Modal>

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
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  exerciseNameClickable: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 12,
  },
  setsContainer: {
    marginBottom: 12,
  },
  setHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  setHeaderText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  setNumber: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  setInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  durationInput: {
    flex: 1,
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
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#D1D1D6',
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  newExerciseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  exerciseList: {
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
  exerciseOptionImageContainer: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 12,
  },
  exerciseOptionImage: {
    width: '100%',
    height: '100%',
  },
  exerciseOptionPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseOptionInfo: {
    flex: 1,
  },
  exerciseOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  exerciseOptionDetail: {
    fontSize: 14,
    color: '#6E6E73',
  },
});
