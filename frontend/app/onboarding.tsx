import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Button from '../components/Button';
import api from '../utils/api';

const STEPS = ['Basics', 'Training', 'About You', 'Done'];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

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

  const saveProfile = async (skipToEnd = false) => {
    try {
      setLoading(true);
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

      if (skipToEnd || currentStep === STEPS.length - 1) {
        // Profile complete, go to main app
        router.replace('/(tabs)/workout');
      }
    } catch (error: any) {
      console.error('Failed to save profile:', error);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    // Save current step data
    await saveProfile();

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Onboarding',
      'You can complete your profile later in Settings',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', onPress: () => router.replace('/(tabs)/workout') },
      ]
    );
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return renderBasicsStep();
      case 1:
        return renderTrainingStep();
      case 2:
        return renderPhysiologyStep();
      case 3:
        return renderBackgroundStep();
      default:
        return null;
    }
  };

  const renderBasicsStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Let's start with the basics</Text>

      <Text style={styles.label}>Sex</Text>
      <View style={styles.optionsRow}>
        {['male', 'female', 'other'].map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.optionButton, sex === option && styles.optionButtonActive]}
            onPress={() => setSex(option)}
          >
            <Text style={[styles.optionText, sex === option && styles.optionTextActive]}>
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
  );

  const renderTrainingStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Tell us about your training</Text>

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
  );

  const renderPhysiologyStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Tell us about yourself (Optional)</Text>

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
  );

  const renderBackgroundStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Almost done!</Text>
      <Text style={styles.description}>
        You've completed all the essential information. You can always update your profile later in settings.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile Setup</Text>
          <TouchableOpacity onPress={handleSkip}>
            <Text style={styles.skipButton}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Progress indicator */}
        <View style={styles.progressContainer}>
          {STEPS.map((step, index) => (
            <View key={step} style={styles.progressItem}>
              <View
                style={[
                  styles.progressDot,
                  index <= currentStep && styles.progressDotActive,
                ]}
              />
              <Text
                style={[
                  styles.progressText,
                  index === currentStep && styles.progressTextActive,
                ]}
              >
                {step}
              </Text>
            </View>
          ))}
        </View>

        {/* Step content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </ScrollView>

        {/* Navigation buttons */}
        <View style={styles.footer}>
          {currentStep > 0 && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setCurrentStep(currentStep - 1)}
            >
              <Ionicons name="arrow-back" size={20} color="#007AFF" />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          <Button
            title={currentStep === STEPS.length - 1 ? 'Finish' : 'Next'}
            onPress={handleNext}
            loading={loading}
            style={styles.nextButton}
          />
        </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  skipButton: {
    fontSize: 16,
    color: '#007AFF',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
  },
  progressItem: {
    alignItems: 'center',
    flex: 1,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E5E5EA',
    marginBottom: 8,
  },
  progressDotActive: {
    backgroundColor: '#007AFF',
  },
  progressText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  progressTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  stepContainer: {
    minHeight: 400,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 24,
  },
  description: {
    fontSize: 16,
    color: '#8E8E93',
    lineHeight: 24,
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  datePickerButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
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
  textArea: {
    minHeight: 100,
    paddingTop: 16,
  },
  textAreaLarge: {
    minHeight: 200,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  optionButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
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
    fontSize: 16,
    color: '#1C1C1E',
  },
  optionTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    gap: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  nextButton: {
    flex: 1,
  },
});
