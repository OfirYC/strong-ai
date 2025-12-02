import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Button from '../../components/Button';
import api from '../../utils/api';
import { WorkoutTemplate } from '../../types';
import RoutineDetailModal from '../../components/RoutineDetailModal';
import { useWorkoutStore } from '../../store/workoutStore';

export default function RoutinesScreen() {
  const router = useRouter();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await api.get('/templates');
      setTemplates(response.data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string, name: string) => {
    Alert.alert('Delete Routine', `Are you sure you want to delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/templates/${templateId}`);
            setTemplates((prev) => prev.filter((t) => t.id !== templateId));
          } catch (error) {
            Alert.alert('Error', 'Failed to delete routine');
          }
        },
      },
    ]);
  };

  const renderTemplate = ({ item }: { item: WorkoutTemplate }) => (
    <View style={styles.templateCard}>
      <TouchableOpacity
        style={styles.templateInfo}
        onPress={() => router.push(`/routine/${item.id}`)}
      >
        <Text style={styles.templateName}>{item.name}</Text>
        <Text style={styles.templateDetail}>
          {item.exercises.length} exercises
        </Text>
        {item.notes && (
          <Text style={styles.templateNotes} numberOfLines={2}>
            {item.notes}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteTemplate(item.id, item.name)}
      >
        <Ionicons name="trash-outline" size={20} color="#FF453A" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Routines</Text>
        <Button
          title="Create Routine"
          onPress={() => router.push('/create-routine')}
          style={styles.createButton}
        />
      </View>

      <FlatList
        data={templates}
        keyExtractor={(item) => item.id}
        renderItem={renderTemplate}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={loadTemplates}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="list-outline" size={64} color="#3A3A3C" />
            <Text style={styles.emptyText}>No routines yet</Text>
            <Text style={styles.emptySubtext}>
              Create your first routine to get started
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  createButton: {
    marginBottom: 0,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  templateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  templateDetail: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  templateNotes: {
    fontSize: 12,
    color: '#636366',
    marginTop: 4,
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#636366',
    marginTop: 8,
  },
});
