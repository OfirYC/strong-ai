import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { EXERCISE_KINDS, ExerciseKind } from '../types';

const BODY_PARTS = [
  'Arms',
  'Back',
  'Cardio',
  'Chest',
  'Core',
  'Full-Body',
  'Legs',
  'Olympic',
  'Other',
  'Shoulders',
];

interface CreateExerciseModalProps {
  visible: boolean;
  onClose: () => void;
  onExerciseCreated: () => void;
}

export default function CreateExerciseModal({
  visible,
  onClose,
  onExerciseCreated,
}: CreateExerciseModalProps) {
  const [name, setName] = useState('');
  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ExerciseKind | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName('');
    setSelectedBodyPart(null);
    setSelectedCategory(null);
    setImageUrl('');
    setInstructions('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter an exercise name');
      return;
    }
    if (!selectedBodyPart) {
      Alert.alert('Error', 'Please select a body part');
      return;
    }
    if (!selectedCategory) {
      Alert.alert('Error', 'Please select a category');
      return;
    }

    try {
      setSaving(true);
      await api.post('/exercises', {
        name: name.trim(),
        exercise_kind: selectedCategory,
        primary_body_parts: [selectedBodyPart],
        category: selectedCategory,
        is_custom: true,
        image: imageUrl.trim() || null,
        instructions: instructions.trim() || null,
      });

      resetForm();
      onExerciseCreated();
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create exercise');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New Exercise</Text>
          <TouchableOpacity onPress={handleCreate} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Text style={styles.createText}>Create</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Name Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Exercise name"
              placeholderTextColor="#8E8E93"
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </View>

          {/* Body Part Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Body Part</Text>
            <View style={styles.optionsGrid}>
              {BODY_PARTS.map((part) => (
                <TouchableOpacity
                  key={part}
                  style={[
                    styles.optionChip,
                    selectedBodyPart === part && styles.optionChipSelected,
                  ]}
                  onPress={() => setSelectedBodyPart(part)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selectedBodyPart === part && styles.optionTextSelected,
                    ]}
                  >
                    {part}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Category Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category</Text>
            <View style={styles.optionsGrid}>
              {EXERCISE_KINDS.map((kind) => (
                <TouchableOpacity
                  key={kind}
                  style={[
                    styles.optionChip,
                    selectedCategory === kind && styles.optionChipSelected,
                  ]}
                  onPress={() => setSelectedCategory(kind)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selectedCategory === kind && styles.optionTextSelected,
                    ]}
                  >
                    {kind}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  cancelText: {
    fontSize: 17,
    color: '#007AFF',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  createText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  optionChipSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  optionText: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  optionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
