import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Button from '../components/Button';
import api from '../utils/api';

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [sex, setSex] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date>(new Date(1990, 0, 1));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [trainingAge, setTrainingAge] = useState('');
  const [goals, setGoals] = useState('');
  const [injuryHistory, setInjuryHistory] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [strengths, setStrengths] = useState('');
  const [backgroundStory, setBackgroundStory] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const response = await api.get('/profile');
      const profile = response.data;

      setSex(profile.sex || '');
      if (profile.date_of_birth) {
        setDateOfBirth(new Date(profile.date_of_birth));
      }
      setHeightCm(profile.height_cm?.toString() || '');
      setWeightKg(profile.weight_kg?.toString() || '');
      setTrainingAge(profile.training_age || '');
      setGoals(profile.goals || '');
      setInjuryHistory(profile.injury_history || '');
      setWeaknesses(profile.weaknesses || '');
      setStrengths(profile.strengths || '');
      setBackgroundStory(profile.background_story || '');
    } catch (error: any) {
      console.error('Failed to load profile:', error);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.put('/profile', {
        sex: sex || null,
        date_of_birth: dateOfBirth ? dateOfBirth.toISOString() : null,
        height_cm: heightCm ? parseFloat(heightCm) : null,
        weight_kg: weightKg ? parseFloat(weightKg) : null,
        training_age: trainingAge || null,
        goals: goals || null,
        injury_history: injuryHistory || null,
        weaknesses: weaknesses || null,
        strengths: strengths || null,
        background_story: backgroundStory || null,
      });

      Alert.alert('Success', 'Profile updated successfully');
      router.back();
    } catch (error: any) {
      console.error('Failed to save profile:', error);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile Settings</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Basics Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>

            <Text style={styles.label}>Sex</Text>
            <View style={styles.optionsRow}>
              {['male', 'female', 'other'].map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.optionButton,
                    sex === option && styles.optionButtonActive,
                  ]}
                  onPress={() => setSex(option)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      sex === option && styles.optionTextActive,
                    ]}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Date of Birth</Text>
            <TouchableOpacity 
              style={styles.datePickerButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.datePickerText}>
                {dateOfBirth.toLocaleDateString()}
              </Text>
              <Ionicons name="calendar-outline" size={20} color="#007AFF" />
            </TouchableOpacity>
            
            {showDatePicker && (
              <View style={styles.datePickerContainer}>
                <DateTimePicker
                  value={dateOfBirth}
                  mode="date"
                  display="spinner"
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (selectedDate) {
                      setDateOfBirth(selectedDate);
                    }
                  }}
                  maximumDate={new Date()}
                  textColor="#1C1C1E"
                  themeVariant="light"
                />
              </View>
            )}

            <Text style={styles.label}>Height (cm)</Text>
            <TextInput
              style={styles.input}
              value={heightCm}
              onChangeText={setHeightCm}
              placeholder="175"
              keyboardType="numeric"
              placeholderTextColor="#8E8E93"
            />

            <Text style={styles.label}>Weight (kg)</Text>
            <TextInput
              style={styles.input}
              value={weightKg}
              onChangeText={setWeightKg}
              placeholder="70"
              keyboardType="numeric"
              placeholderTextColor="#8E8E93"
            />
          </View>

          {/* Training Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Training Context</Text>

            <Text style={styles.label}>Training Age</Text>
            <View style={styles.optionsGrid}>
              {[
                { value: 'new', label: 'New' },
                { value: '1-2y', label: '1-2 years' },
                { value: '2-5y', label: '2-5 years' },
                { value: '5y+', label: '5+ years' },
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    styles.optionButtonWide,
                    trainingAge === option.value && styles.optionButtonActive,
                  ]}
                  onPress={() => setTrainingAge(option.value)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      trainingAge === option.value && styles.optionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Goals</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={goals}
              onChangeText={setGoals}
              placeholder="e.g., sprint speed + military prep + EMOM endurance"
              placeholderTextColor="#8E8E93"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* About You Section - Reordered */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About You</Text>

            <Text style={styles.label}>Background Story</Text>
            <TextInput
              style={[styles.input, styles.textArea, styles.textAreaLarge]}
              value={backgroundStory}
              onChangeText={setBackgroundStory}
              placeholder="Tell us about your fitness journey - how you started training, phases, current goals, military prep, etc."
              placeholderTextColor="#8E8E93"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            <Text style={styles.label}>Injury History</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={injuryHistory}
              onChangeText={setInjuryHistory}
              placeholder="Any injuries or conditions we should know about?"
              placeholderTextColor="#8E8E93"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Text style={styles.label}>Strengths</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={strengths}
              onChangeText={setStrengths}
              placeholder="What are you good at?"
              placeholderTextColor="#8E8E93"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Text style={styles.label}>Weaknesses</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={weaknesses}
              onChangeText={setWeaknesses}
              placeholder="What areas do you want to improve?"
              placeholderTextColor="#8E8E93"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <Button
            title="Save Changes"
            onPress={handleSave}
            loading={saving}
            style={styles.saveButton}
          />

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  keyboardView: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 12,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F7',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  datePickerButton: {
    backgroundColor: '#F5F5F7',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  datePickerText: {
    fontSize: 16,
    color: '#1C1C1E',
  },
  datePickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    marginTop: 8,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  textAreaLarge: {
    minHeight: 150,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#E5E5EA',
    alignItems: 'center',
  },
  optionButtonWide: {
    flex: 0,
    minWidth: '48%',
  },
  optionButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#E5F0FF',
  },
  optionText: {
    fontSize: 14,
    color: '#1C1C1E',
  },
  optionTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  saveButton: {
    marginTop: 8,
  },
  bottomSpacer: {
    height: 40,
  },
});
