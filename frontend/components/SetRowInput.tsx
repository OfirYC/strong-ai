import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DecimalInput from './DecimalInput';
import DurationInput from './DurationInput';
import { getExerciseFields, ExerciseKind } from '../types';

export interface SetData {
  weight?: number;
  reps?: number;
  duration?: number;
  distance?: number;
  is_warmup?: boolean;
  completed?: boolean;
}

interface SetRowInputProps {
  set: SetData;
  setIndex: number;
  exerciseKind: ExerciseKind;
  onUpdateSet: (field: string, value: any) => void;
  showCompleteButton?: boolean;
  containerStyle?: ViewStyle;
}

/**
 * Reusable set row input component used in both ActiveWorkoutSheet and CreateRoutine
 * Renders appropriate inputs based on exercise kind (weight/reps, duration, distance, etc.)
 */
export default function SetRowInput({
  set,
  setIndex,
  exerciseKind,
  onUpdateSet,
  showCompleteButton = false,
  containerStyle,
}: SetRowInputProps) {
  const fields = getExerciseFields(exerciseKind);
  const isCompleted = set.completed;

  return (
    <View style={[
      styles.setRow, 
      isCompleted && styles.setRowCompleted,
      containerStyle
    ]}>
      <Text style={[styles.setNumber, isCompleted && styles.setNumberCompleted]}>
        {setIndex + 1}
      </Text>
      
      {fields.includes('weight') && (
        <DecimalInput
          style={[styles.setInput, isCompleted && styles.setInputCompleted]}
          value={set.weight || 0}
          onChangeValue={(value) => onUpdateSet('weight', value)}
          placeholder="0"
        />
      )}
      
      {fields.includes('reps') && (
        <TextInput
          style={[styles.setInput, isCompleted && styles.setInputCompleted]}
          value={set.reps?.toString() || ''}
          onChangeText={(value) => onUpdateSet('reps', parseInt(value) || 0)}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor="#999"
        />
      )}
      
      {fields.includes('duration') && (
        <DurationInput
          value={set.duration || 0}
          onChangeValue={(value) => onUpdateSet('duration', value)}
          style={[styles.durationInput, isCompleted && styles.durationInputCompleted]}
        />
      )}
      
      {fields.includes('distance') && (
        <DecimalInput
          style={[styles.setInput, isCompleted && styles.setInputCompleted]}
          value={set.distance || 0}
          onChangeValue={(value) => onUpdateSet('distance', value)}
          placeholder="0"
        />
      )}
      
      {showCompleteButton && (
        <TouchableOpacity 
          style={[styles.completeButton, isCompleted && styles.completeButtonActive]}
          onPress={() => onUpdateSet('completed', !isCompleted)}
        >
          <Ionicons name="checkmark" size={18} color={isCompleted ? '#FFFFFF' : '#D1D1D6'} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Helper component for set header row
export function SetHeader({ exerciseKind, showCompleteColumn = false }: { exerciseKind: ExerciseKind; showCompleteColumn?: boolean }) {
  const fields = getExerciseFields(exerciseKind);
  
  return (
    <View style={styles.setHeader}>
      <Text style={styles.setHeaderText}>SET</Text>
      {fields.includes('weight') && <Text style={styles.setHeaderText}>KG</Text>}
      {fields.includes('reps') && <Text style={styles.setHeaderText}>REPS</Text>}
      {fields.includes('duration') && <Text style={styles.setHeaderText}>TIME</Text>}
      {fields.includes('distance') && <Text style={styles.setHeaderText}>KM</Text>}
      {showCompleteColumn && <Text style={styles.setHeaderText}></Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  setHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  setRowCompleted: {
    opacity: 0.7,
  },
  setNumber: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  setNumberCompleted: {
    color: '#34C759',
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
  setInputCompleted: {
    backgroundColor: '#E8F8ED',
    borderColor: '#34C759',
  },
  durationInput: {
    flex: 1,
  },
  durationInputCompleted: {
    backgroundColor: '#E8F8ED',
    borderColor: '#34C759',
  },
  completeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F5F5F7',
    borderWidth: 2,
    borderColor: '#D1D1D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButtonActive: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
});
