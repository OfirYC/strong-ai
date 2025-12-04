import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

interface PlannedWorkout {
  id: string;
  date: string;
  name: string;
  status: 'planned' | 'in_progress' | 'completed' | 'skipped';
  template_id?: string;
}

interface CalendarModalProps {
  visible: boolean;
  onClose: () => void;
  onDateSelect?: (date: string, workouts: PlannedWorkout[]) => void;
}

export default function CalendarModal({ visible, onClose, onDateSelect }: CalendarModalProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [workoutsByDate, setWorkoutsByDate] = useState<{ [key: string]: PlannedWorkout[] }>({});
  const [loading, setLoading] = useState(false);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  useEffect(() => {
    if (visible) {
      loadMonthWorkouts();
    }
  }, [visible, currentDate]);

  const loadMonthWorkouts = async () => {
    try {
      setLoading(true);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      
      // Get first and last day of the month
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      
      const startDate = firstDay.toISOString().split('T')[0];
      const endDate = lastDay.toISOString().split('T')[0];
      
      const response = await api.get(`/planned-workouts?start_date=${startDate}&end_date=${endDate}`);
      const workouts: PlannedWorkout[] = response.data;
      
      // Group workouts by date
      const grouped: { [key: string]: PlannedWorkout[] } = {};
      workouts.forEach((workout) => {
        if (!grouped[workout.date]) {
          grouped[workout.date] = [];
        }
        grouped[workout.date].push(workout);
      });
      
      setWorkoutsByDate(grouped);
    } catch (error) {
      console.error('Failed to load month workouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Get day of week for first day (0 = Sunday, 1 = Monday, etc.)
    // Adjust so Monday = 0
    let firstDayOfWeek = firstDay.getDay() - 1;
    if (firstDayOfWeek === -1) firstDayOfWeek = 6;
    
    const daysInMonth = lastDay.getDate();
    
    return { firstDayOfWeek, daysInMonth };
  };

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
  };

  const handleDatePress = (dateStr: string) => {
    setSelectedDate(dateStr);
    const workouts = workoutsByDate[dateStr] || [];
    if (onDateSelect) {
      onDateSelect(dateStr, workouts);
    }
  };

  const getStatusColor = (workouts: PlannedWorkout[]) => {
    if (workouts.some(w => w.status === 'completed')) return '#34C759';
    if (workouts.some(w => w.status === 'in_progress')) return '#FF9500';
    if (workouts.some(w => w.status === 'skipped')) return '#8E8E93';
    return '#007AFF';
  };

  const renderCalendar = () => {
    const { firstDayOfWeek, daysInMonth } = getDaysInMonth();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const days = [];
    const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;
    
    for (let i = 0; i < totalCells; i++) {
      const dayNumber = i - firstDayOfWeek + 1;
      const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth;
      
      if (isValidDay) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        const workouts = workoutsByDate[dateStr] || [];
        const hasWorkouts = workouts.length > 0;
        const isToday = dateStr === new Date().toISOString().split('T')[0];
        const isSelected = dateStr === selectedDate;
        
        days.push(
          <TouchableOpacity
            key={i}
            style={[
              styles.dayCell,
              isToday && styles.todayCell,
              isSelected && styles.selectedCell,
            ]}
            onPress={() => handleDatePress(dateStr)}
          >
            <Text style={[
              styles.dayText,
              isToday && styles.todayText,
              isSelected && styles.selectedText,
            ]}>
              {dayNumber}
            </Text>
            {hasWorkouts && (
              <View style={styles.indicatorContainer}>
                {workouts.slice(0, 3).map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.workoutIndicator,
                      { backgroundColor: getStatusColor(workouts) }
                    ]}
                  />
                ))}
              </View>
            )}
          </TouchableOpacity>
        );
      } else {
        days.push(<View key={i} style={styles.dayCell} />);
      }
    }
    
    return days;
  };

  const renderSelectedDateWorkouts = () => {
    if (!selectedDate) return null;
    
    const workouts = workoutsByDate[selectedDate] || [];
    if (workouts.length === 0) return null;
    
    const dateObj = new Date(selectedDate + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
    
    return (
      <View style={styles.selectedDateSection}>
        <Text style={styles.selectedDateTitle}>{formattedDate}</Text>
        {workouts.map((workout) => (
          <View key={workout.id} style={styles.workoutItem}>
            <View style={[styles.workoutStatus, { backgroundColor: getStatusColor([workout]) }]} />
            <View style={styles.workoutInfo}>
              <Text style={styles.workoutName}>{workout.name}</Text>
              <Text style={styles.workoutStatusText}>
                {workout.status.replace('_', ' ')}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

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
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={28} color="#1C1C1E" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Workout Calendar</Text>
              <TouchableOpacity onPress={goToToday} style={styles.todayButton}>
                <Text style={styles.todayButtonText}>Today</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Month Navigation */}
              <View style={styles.monthNav}>
                <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
                  <Ionicons name="chevron-back" size={24} color="#007AFF" />
                </TouchableOpacity>
                <Text style={styles.monthTitle}>
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </Text>
                <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
                  <Ionicons name="chevron-forward" size={24} color="#007AFF" />
                </TouchableOpacity>
              </View>

              {/* Day Headers */}
              <View style={styles.dayHeaders}>
                {dayNames.map((day) => (
                  <View key={day} style={styles.dayHeader}>
                    <Text style={styles.dayHeaderText}>{day}</Text>
                  </View>
                ))}
              </View>

              {/* Calendar Grid */}
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                </View>
              ) : (
                <View style={styles.calendarGrid}>
                  {renderCalendar()}
                </View>
              )}

              {/* Selected Date Workouts */}
              {renderSelectedDateWorkouts()}

              {/* Legend */}
              <View style={styles.legend}>
                <Text style={styles.legendTitle}>Status</Text>
                <View style={styles.legendItems}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#007AFF' }]} />
                    <Text style={styles.legendText}>Planned</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#FF9500' }]} />
                    <Text style={styles.legendText}>In Progress</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#34C759' }]} />
                    <Text style={styles.legendText}>Completed</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#8E8E93' }]} />
                    <Text style={styles.legendText}>Skipped</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
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
    marginTop: 60,
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
  closeButton: {
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
  todayButton: {
    width: 60,
    alignItems: 'flex-end',
  },
  todayButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  content: {
    flex: 1,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  navButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  dayHeaders: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  dayHeader: {
    flex: 1,
    alignItems: 'center',
  },
  dayHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    marginBottom: 4,
  },
  todayCell: {
    backgroundColor: '#E8F4FF',
    borderRadius: 8,
  },
  selectedCell: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  dayText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  todayText: {
    color: '#007AFF',
    fontWeight: '700',
  },
  selectedText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  indicatorContainer: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 2,
  },
  workoutIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  selectedDateSection: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
  },
  selectedDateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  workoutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 8,
  },
  workoutStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  workoutInfo: {
    flex: 1,
  },
  workoutName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  workoutStatusText: {
    fontSize: 13,
    color: '#8E8E93',
    textTransform: 'capitalize',
  },
  legend: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  legendItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 13,
    color: '#636366',
  },
});
