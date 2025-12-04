import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../utils/api';
import { WorkoutTemplate } from '../types';

interface ScheduleWorkoutModalProps {
  visible: boolean;
  routine: WorkoutTemplate | null;
  onClose: () => void;
  onScheduled: () => void;
}

export default function ScheduleWorkoutModal({
  visible,
  routine,
  onClose,
  onScheduled,
}: ScheduleWorkoutModalProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days from now
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const weekDays = [
    { label: 'Mon', value: 0 },
    { label: 'Tue', value: 1 },
    { label: 'Wed', value: 2 },
    { label: 'Thu', value: 3 },
    { label: 'Fri', value: 4 },
    { label: 'Sat', value: 5 },
    { label: 'Sun', value: 6 },
  ];

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort());
    }
  };

  const handleSchedule = async () => {
    if (!routine) return;

    // Validation
    if (isRecurring && recurrenceType === 'weekly' && selectedDays.length === 0) {
      Alert.alert('Selection Required', 'Please select at least one day for weekly recurrence');
      return;
    }

    try {
      setLoading(true);
      
      const payload: any = {
        date: selectedDate.toISOString().split('T')[0],
        name: routine.name,
        template_id: routine.id,
        is_recurring: isRecurring,
        order: 0,
      };

      if (isRecurring) {
        payload.recurrence_type = recurrenceType;
        
        if (recurrenceType === 'weekly') {
          payload.recurrence_days = selectedDays;
        }
        
        if (hasEndDate) {
          payload.recurrence_end_date = endDate.toISOString().split('T')[0];
        }
      }

      await api.post('/planned-workouts', payload);
      
      Alert.alert('Success', 'Workout scheduled successfully!');
      onScheduled();
      onClose();
      
      // Reset state
      setIsRecurring(false);
      setSelectedDays([]);
      setHasEndDate(false);
      setRecurrenceType('weekly');
    } catch (error: any) {
      console.error('Failed to schedule workout:', error);
      Alert.alert('Error', 'Failed to schedule workout');
    } finally {
      setLoading(false);
    }
  };

  if (!routine) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.backdrop} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <TouchableOpacity 
          style={styles.modalContent} 
          activeOpacity={1} 
          onPress={(e) => e.stopPropagation()}
        >
          <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                <Ionicons name="close" size={28} color="#1C1C1E" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Schedule Workout</Text>
              <View style={styles.headerButton} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Routine Name */}
              <View style={styles.section}>
                <Text style={styles.routineName}>{routine.name}</Text>
                <Text style={styles.routineDetail}>{routine.exercises.length} exercises</Text>
              </View>

              {/* Date Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Date</Text>
                <TouchableOpacity 
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color="#007AFF" />
                  <Text style={styles.dateText}>
                    {selectedDate.toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Date Picker Modal */}
              {showDatePicker && (
                <Modal
                  visible={showDatePicker}
                  transparent={true}
                  animationType="fade"
                  onRequestClose={() => setShowDatePicker(false)}
                >
                  <TouchableOpacity 
                    style={styles.datePickerBackdrop}
                    activeOpacity={1}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <View style={styles.datePickerContainer}>
                      <View style={styles.datePickerHeader}>
                        <Text style={styles.datePickerTitle}>Select Date</Text>
                        <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                          <Text style={styles.datePickerDone}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={selectedDate}
                        mode="date"
                        display="inline"
                        onChange={(event, date) => {
                          if (date) setSelectedDate(date);
                        }}
                        themeVariant="light"
                      />
                    </View>
                  </TouchableOpacity>
                </Modal>
              )}

              {/* Recurring Toggle */}
              <View style={styles.section}>
                <View style={styles.switchRow}>
                  <Text style={styles.sectionLabel}>Repeat</Text>
                  <Switch
                    value={isRecurring}
                    onValueChange={setIsRecurring}
                    trackColor={{ false: '#D1D1D6', true: '#34C759' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>

              {/* Recurring Options */}
              {isRecurring && (
                <>
                  {/* Recurrence Type */}
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Frequency</Text>
                    <View style={styles.optionsRow}>
                      {['daily', 'weekly', 'monthly'].map((type) => (
                        <TouchableOpacity
                          key={type}
                          style={[
                            styles.option,
                            recurrenceType === type && styles.optionSelected,
                          ]}
                          onPress={() => setRecurrenceType(type as any)}
                        >
                          <Text style={[
                            styles.optionText,
                            recurrenceType === type && styles.optionTextSelected,
                          ]}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Weekly Day Selection */}
                  {recurrenceType === 'weekly' && (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Repeat On</Text>
                      <View style={styles.daysRow}>
                        {weekDays.map((day) => (
                          <TouchableOpacity
                            key={day.value}
                            style={[
                              styles.dayButton,
                              selectedDays.includes(day.value) && styles.dayButtonSelected,
                            ]}
                            onPress={() => toggleDay(day.value)}
                          >
                            <Text style={[
                              styles.dayText,
                              selectedDays.includes(day.value) && styles.dayTextSelected,
                            ]}>
                              {day.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* End Date Toggle */}
                  <View style={styles.section}>
                    <View style={styles.switchRow}>
                      <Text style={styles.sectionLabel}>End Date</Text>
                      <Switch
                        value={hasEndDate}
                        onValueChange={setHasEndDate}
                        trackColor={{ false: '#D1D1D6', true: '#34C759' }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  </View>

                  {/* End Date Picker */}
                  {hasEndDate && (
                    <View style={styles.section}>
                      <TouchableOpacity 
                        style={styles.dateButton}
                        onPress={() => setShowEndDatePicker(true)}
                      >
                        <Ionicons name="calendar-outline" size={20} color="#007AFF" />
                        <Text style={styles.dateText}>
                          {endDate.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {showEndDatePicker && (
                    <DateTimePicker
                      value={endDate}
                      mode="date"
                      display="spinner"
                      minimumDate={selectedDate}
                      onChange={(event, date) => {
                        setShowEndDatePicker(false);
                        if (date) setEndDate(date);
                      }}
                    />
                  )}
                </>
              )}

              <View style={styles.bottomSpacer} />
            </ScrollView>

            {/* Schedule Button */}
            <View style={styles.footer}>
              <TouchableOpacity 
                style={[styles.scheduleButton, loading && styles.scheduleButtonDisabled]}
                onPress={handleSchedule}
                disabled={loading}
              >
                <Text style={styles.scheduleButtonText}>
                  {loading ? 'Scheduling...' : 'Schedule'}
                </Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    flex: 1,
    marginTop: 100,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerButton: {
    width: 44,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  routineName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  routineDetail: {
    fontSize: 16,
    color: '#8E8E93',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  dateText: {
    fontSize: 16,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  option: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    backgroundColor: '#E8F4FF',
    borderColor: '#007AFF',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
  },
  optionTextSelected: {
    color: '#007AFF',
  },
  daysRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dayButton: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dayButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  dayTextSelected: {
    color: '#FFFFFF',
  },
  bottomSpacer: {
    height: 40,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  scheduleButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  scheduleButtonDisabled: {
    opacity: 0.5,
  },
  scheduleButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
