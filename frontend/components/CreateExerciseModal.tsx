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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName('');
    setSelectedBodyPart(null);
    setSelectedCategory(null);
    setImageBase64(null);
    setInstructions('');
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera roll permissions to upload images');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setImageBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const removeImage = () => {
    setImageBase64(null);
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
        image: imageBase64 || null,
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

          {/* Optional: Image Upload */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Image (Optional)</Text>
            {imageBase64 ? (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: imageBase64 }} style={styles.imagePreview} />
                <TouchableOpacity style={styles.removeImageButton} onPress={removeImage}>
                  <Ionicons name="close-circle" size={28} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
                <Ionicons name="camera-outline" size={32} color="#007AFF" />
                <Text style={styles.uploadButtonText}>Upload Image</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Optional: Instructions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions (Optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="How to perform this exercise..."
              placeholderTextColor="#8E8E93"
              value={instructions}
              onChangeText={setInstructions}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.bottomSpacer} />
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
  uploadButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 8,
  },
  imagePreviewContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  bottomSpacer: {
    height: 40,
  },
});
