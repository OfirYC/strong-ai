import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '../utils/api';
import { Exercise } from '../types';

// Placeholder image for exercises without images
const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop';

interface ExerciseDetailModalProps {
  visible: boolean;
  exercise: Exercise | null;
  onClose: () => void;
  onExerciseUpdated: () => void;
}

export default function ExerciseDetailModal({
  visible,
  exercise,
  onClose,
  onExerciseUpdated,
}: ExerciseDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleStartEditing = () => {
    setInstructions(exercise?.instructions || '');
    setIsEditing(true);
  };

  const handleSaveInstructions = async () => {
    if (!exercise) return;

    try {
      setSaving(true);
      await api.patch(`/exercises/${exercise.id}`, {
        instructions: instructions.trim(),
      });
      setIsEditing(false);
      onExerciseUpdated();
      Alert.alert('Success', 'Instructions saved!');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save instructions');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setInstructions('');
  };

  const handleUploadImage = async () => {
    if (!exercise) return;

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
      try {
        setUploadingImage(true);
        await api.patch(`/exercises/${exercise.id}`, {
          image: `data:image/jpeg;base64,${result.assets[0].base64}`,
        });
        onExerciseUpdated();
        Alert.alert('Success', 'Image uploaded!');
      } catch (error: any) {
        Alert.alert('Error', error.response?.data?.detail || 'Failed to upload image');
      } finally {
        setUploadingImage(false);
      }
    }
  };

  if (!exercise) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{exercise.name}</Text>
          <View style={{ width: 28 }} />
        </View>

        <KeyboardAvoidingView 
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Exercise Image */}
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: exercise.image || PLACEHOLDER_IMAGE }}
                style={styles.image}
                resizeMode="cover"
              />
              {!exercise.image && (
                <View style={styles.placeholderOverlay}>
                  <Ionicons name="fitness" size={48} color="#FFFFFF" />
                </View>
              )}
            </View>

            {/* Exercise Info */}
            <View style={styles.infoSection}>
              <View style={styles.infoRow}>
                <View style={styles.infoBadge}>
                  <Text style={styles.infoBadgeText}>{exercise.exercise_kind}</Text>
                </View>
                <View style={styles.infoBadge}>
                  <Text style={styles.infoBadgeText}>{exercise.primary_body_parts.join(', ')}</Text>
                </View>
              </View>
              {exercise.is_custom && (
                <View style={[styles.infoBadge, styles.customBadge]}>
                  <Text style={styles.customBadgeText}>Custom Exercise</Text>
                </View>
              )}
            </View>

            {/* Instructions Section */}
            <View style={styles.instructionsSection}>
              <Text style={styles.sectionTitle}>Instructions</Text>
              
              {isEditing ? (
                <View style={styles.editContainer}>
                  <TextInput
                    style={styles.instructionsInput}
                    value={instructions}
                    onChangeText={setInstructions}
                    placeholder="Enter exercise instructions..."
                    placeholderTextColor="#8E8E93"
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    autoFocus
                  />
                  <View style={styles.editButtons}>
                    <TouchableOpacity 
                      style={styles.cancelButton}
                      onPress={handleCancelEditing}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.saveButton}
                      onPress={handleSaveInstructions}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.saveButtonText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : exercise.instructions ? (
                <View>
                  <Text style={styles.instructionsText}>{exercise.instructions}</Text>
                  <TouchableOpacity 
                    style={styles.editLink}
                    onPress={handleStartEditing}
                  >
                    <Ionicons name="pencil" size={16} color="#007AFF" />
                    <Text style={styles.editLinkText}>Edit Instructions</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.addInstructionsButton}
                  onPress={handleStartEditing}
                >
                  <Ionicons name="add-circle-outline" size={24} color="#007AFF" />
                  <Text style={styles.addInstructionsText}>Add Instructions</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  content: {
    flex: 1,
  },
  imageContainer: {
    width: '100%',
    height: 220,
    backgroundColor: '#E5E5EA',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 8,
  },
  infoBadge: {
    backgroundColor: '#E5E5EA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  infoBadgeText: {
    fontSize: 14,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  customBadge: {
    backgroundColor: '#007AFF',
  },
  customBadgeText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  instructionsSection: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 16,
    color: '#3A3A3C',
    lineHeight: 24,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
  },
  editLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  editLinkText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  addInstructionsButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    gap: 8,
  },
  addInstructionsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  editContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  instructionsInput: {
    fontSize: 16,
    color: '#1C1C1E',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingTop: 16,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#E5E5EA',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    minWidth: 80,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
