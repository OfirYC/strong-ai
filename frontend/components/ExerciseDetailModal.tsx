import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { BarChart, LineChart } from "react-native-gifted-charts";
import { SafeAreaView } from "react-native-safe-area-context";
import { Exercise, ExerciseHistoryResponse } from "../types";
import type { ExerciseHistoryEntry as ExerciseHistory } from "../types/gen";
import api from "../utils/api";
import { getGroupsFromLoads } from "../utils/muscleUtils";
import { SetNumber } from "./SetNumber";
import { useExercises } from "../store/exercisesStore";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop";

type TabType = "about" | "history" | "charts" | "records";

interface ExerciseDetailModalProps {
  visible: boolean;
  exercise: Exercise | null;
  onClose: () => void;
  onExerciseUpdated: (newExercise: Exercise) => void;
}

interface PersonalRecords {
  maxReps: number;
  maxWeight: number;
  maxVolume: number;
  max1RM: number;
}

interface ChartData {
  dates: string[];
  totalVolume: number[];
  maxReps: number[];
  totalReps: number[];
  best1RMPerWorkout: number[];
  pr1RMProgression: number[];
}

export default function ExerciseDetailModal({
  visible,
  exercise,
  onClose,
  onExerciseUpdated,
}: ExerciseDetailModalProps) {
  const { upsert } = useExercises();

  const [activeTab, setActiveTab] = useState<TabType>("about");
  const [isEditing, setIsEditing] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Data states
  const [history, setHistory] = useState<ExerciseHistory[]>([]);
  const [records, setRecords] = useState<PersonalRecords>({
    maxReps: 0,
    maxWeight: 0,
    maxVolume: 0,
    max1RM: 0,
  });
  const [chartData, setChartData] = useState<ChartData>({
    dates: [],
    totalVolume: [],
    maxReps: [],
    totalReps: [],
    best1RMPerWorkout: [],
    pr1RMProgression: [],
  });

  const [loadingData, setLoadingData] = useState(false);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Reset tab when modal opens
  useEffect(() => {
    if (visible && exercise) {
      setActiveTab("about");
      loadExerciseData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, exercise]);

  const loadExerciseData = async () => {
    if (!exercise) return;

    setLoadingData(true);
    try {
      const res = await api.get(
        `/workouts/history/by-exercise?exercise_id=${exercise.id}&days_back=180&limit_workouts=100`,
      );
      const data = res.data as ExerciseHistoryResponse;

      // 1) Map raw history
      const mappedHistory: ExerciseHistory[] = (data.history || []).map(
        (h: ExerciseHistory) =>
          ({
            workout_id: h.workout_id,
            workout_name: h.workout_name,
            date: h.date, // ISO string
            sets: h.sets || [],
          }) satisfies ExerciseHistory,
      );

      // 2) Sort by date ASCENDING so charts + PR progression are chronological
      const sortedHistory = [...mappedHistory].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      // keep this as the history we render in the History tab
      setHistory(sortedHistory);

      // 3) Records (from backend summary)
      setRecords({
        maxReps: data.max_reps || 0,
        maxWeight: data.max_weight || 0,
        maxVolume: 0,
        max1RM: data.best_e1rm || 0,
      });

      // 4) Build chart arrays from sorted history
      const dates = sortedHistory.map(h => h.date?.slice(0, 10));

      const volumePerWorkout = sortedHistory.map(h =>
        h.sets.reduce(
          (sum: number, s: any) => sum + (s.weight || 0) * (s.reps || 0),
          0,
        ),
      );

      const maxRepsPerWorkout = sortedHistory.map(h =>
        Math.max(...h.sets.map((s: any) => s.reps || 0), 0),
      );

      const totalRepsPerWorkout = sortedHistory.map(h =>
        h.sets.reduce((sum: number, s: any) => sum + (s.reps || 0), 0),
      );

      // Best set per workout -> estimated 1RM
      const best1RMPerWorkout = sortedHistory.map(h => {
        let best = 0;
        (h.sets || []).forEach((s: any) => {
          if (s.weight && s.reps) {
            const est1RM = s.weight * (1 + s.reps / 30);
            if (est1RM > best) best = est1RM;
          }
        });
        return Math.round(best * 10) / 10;
      });

      // PR progression over time (monotonic max of best1RMPerWorkout)
      const pr1RMProgression: number[] = [];
      let currentPR = 0;
      for (let i = 0; i < best1RMPerWorkout.length; i++) {
        currentPR = Math.max(currentPR, best1RMPerWorkout[i] || 0);
        pr1RMProgression.push(Math.round(currentPR * 10) / 10);
      }

      setChartData({
        dates,
        totalVolume: volumePerWorkout,
        maxReps: maxRepsPerWorkout, // max consecutive reps per workout
        totalReps: totalRepsPerWorkout,
        best1RMPerWorkout,
        pr1RMProgression,
      });
    } catch (error) {
      console.error("Failed to load exercise data:", error);
    } finally {
      setLoadingData(false);
    }
  };

  const handleStartEditing = () => {
    setInstructions(exercise?.instructions || "");
    setIsEditing(true);
  };

  const handleSaveInstructions = async () => {
    if (!exercise) return;

    try {
      setSaving(true);
      const response = await api.patch(`/exercises/${exercise.id}`, {
        instructions: instructions.trim(),
      });
      const newExercise = response.data as Exercise;

      // ✅ keep store cache in sync
      upsert(newExercise);

      setIsEditing(false);
      onExerciseUpdated(newExercise);
      Alert.alert("Success", "Instructions saved!");
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.response?.data?.detail || "Failed to save instructions",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setInstructions("");
  };

  const handleUploadImage = async () => {
    if (!exercise) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please grant camera roll permissions to upload images",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      try {
        setUploadingImage(true);
        const response = await api.patch(`/exercises/${exercise.id}`, {
          image: `data:image/jpeg;base64,${result.assets[0].base64}`,
        });

        const newExercise = response.data as Exercise;

        // ✅ keep store cache in sync
        upsert(newExercise);

        onExerciseUpdated(newExercise);
        Alert.alert("Success", "Image uploaded!");
      } catch (error: any) {
        Alert.alert(
          "Error",
          error.response?.data?.detail || "Failed to upload image",
        );
      } finally {
        setUploadingImage(false);
      }
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderAboutTab = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Exercise Image */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: exercise?.image || PLACEHOLDER_IMAGE }}
          style={styles.image}
          resizeMode="cover"
        />
        {!exercise?.image && (
          <View style={styles.placeholderOverlay}>
            <Ionicons name="fitness" size={48} color="#FFFFFF" />
          </View>
        )}
        <TouchableOpacity
          style={styles.uploadImageButton}
          onPress={handleUploadImage}
          disabled={uploadingImage}
        >
          {uploadingImage ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="camera" size={18} color="#FFFFFF" />
              <Text style={styles.uploadImageText}>
                {exercise?.image ? "Change" : "Add Photo"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Exercise Info */}
      <View style={styles.infoSection}>
        <View style={styles.infoRow}>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>{exercise?.exercise_kind}</Text>
          </View>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>
              {getGroupsFromLoads(exercise?.muscle_loads).join(", ") || "—"}
            </Text>
          </View>
        </View>
        {exercise?.is_custom && (
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
        ) : exercise?.instructions ? (
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
  );

  const renderHistoryTab = () => (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.tabContent}>
      {loadingData ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : history.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color="#C7C7CC" />
          <Text style={styles.emptyStateText}>No workout history yet</Text>
          <Text style={styles.emptyStateSubtext}>
            Complete a workout with this exercise to see your history
          </Text>
        </View>
      ) : (
        history
          .slice()
          .reverse()
          .map((item, index) => (
            <View
              key={`${item.workout_id}-${index}`}
              style={styles.historyCard}
            >
              <View style={styles.historyHeader}>
                <Text style={styles.historyWorkoutName}>
                  {item.workout_name}
                </Text>
                <Text style={styles.historyDate}>
                  {formatTime(item.date)}, {formatDate(item.date)}
                </Text>
              </View>

              <Text style={styles.setsPerformedLabel}>Sets Performed</Text>

              {item.sets.map(
                (set: ExerciseHistory["sets"][number], setIndex: number) => (
                  <View key={setIndex} style={styles.historySetRow}>
                    <SetNumber setIndex={setIndex} setType={set.set_type} />
                    <View style={styles.setDetails}>
                      {set.weight != null && set.weight > 0 && (
                        <Text style={styles.setMetric}>{set.weight} kg</Text>
                      )}
                      {set.reps != null && set.reps > 0 && (
                        <Text style={styles.setMetric}>{set.reps} reps</Text>
                      )}
                      {set.duration != null && set.duration > 0 && (
                        <Text style={styles.setMetric}>
                          {Math.floor((set.duration ?? 0) / 60)}:
                          {((set.duration ?? 0) % 60)
                            .toString()
                            .padStart(2, "0")}
                        </Text>
                      )}
                      {set.distance != null && set.distance > 0 && (
                        <Text style={styles.setMetric}>{set.distance} km</Text>
                      )}
                    </View>
                  </View>
                ),
              )}
            </View>
          ))
      )}
    </ScrollView>
  );

  const renderChartsTab = () => {
    if (loadingData) {
      return (
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.tabContent}
        >
          <ActivityIndicator
            size="large"
            color="#007AFF"
            style={styles.loader}
          />
        </ScrollView>
      );
    }

    if (chartData.dates.length === 0) {
      return (
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.tabContent}
        >
          <View style={styles.emptyState}>
            <Ionicons name="bar-chart-outline" size={48} color="#C7C7CC" />
            <Text style={styles.emptyStateText}>No chart data yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Complete more workouts to see your progress
            </Text>
          </View>
        </ScrollView>
      );
    }
    // ---------- LABELS: only for BAR CHARTS ----------
    const totalPoints = chartData.dates.length;
    const MAX_X_LABELS = 18; // tweak if you want more/less labels
    const step = Math.max(1, Math.ceil(totalPoints / MAX_X_LABELS));

    const makeBarLabel = (index: number, value: number | undefined | null) => {
      // no label if there is effectively no bar at that position
      if (!value || value === 0) return "";

      const dateStr = chartData.dates[index];
      if (!dateStr) return "";

      const isSampledPoint = index % step === 0 || index === totalPoints - 1;

      return isSampledPoint ? dateStr.slice(5) : ""; // "MM-DD"
    };

    // ---------- DATA ARRAYS ----------
    // Line charts: NO labels -> no cramped footer, only tooltips
    const best1RMData = chartData.best1RMPerWorkout.map((v, i) => ({
      value: v,
      date: history[i]?.date ?? chartData.dates[i],
    }));

    const pr1RMData = chartData.pr1RMProgression.map((v, i) => ({
      value: v,
      date: history[i]?.date ?? chartData.dates[i],
    }));

    // Bar charts: sparse labels using makeBarLabel
    const volumeData = chartData.totalVolume
      .map((v, i) => ({
        value: v,
        label: makeBarLabel(i, v),
        date: history[i]?.date ?? chartData.dates[i],
      }))
      .filter(v => v.value > 0);

    const maxRepsData = chartData.maxReps.map((v, i) => ({
      value: v,
      label: makeBarLabel(i, v),
      date: history[i]?.date ?? chartData.dates[i],
    }));

    const renderBarTooltip = (item: any, index: number) => {
      if (!item) return null;
      const workout = history[index];
      const rawDate = workout?.date || item.date;
      const dateLabel = rawDate ? formatDate(rawDate) : "";
      const volumeOrReps = item.value ?? 0;

      return (
        <View style={styles.tooltipContainer}>
          {dateLabel ? (
            <Text style={styles.tooltipTitle}>{dateLabel}</Text>
          ) : null}
          {workout?.workout_name ? (
            <Text style={styles.tooltipSubtitle}>{workout.workout_name}</Text>
          ) : null}
          <Text style={styles.tooltipValue}>{volumeOrReps}</Text>
        </View>
      );
    };
    const makeLinePointerConfig = (labelForValue: (item: any) => string) => ({
      pointerStripHeight: 220,
      pointerStripColor: "#C7C7CC",
      pointerStripWidth: 2,
      pointerColor: "#007AFF",
      radius: 4,
      pointerLabelWidth: 150,
      pointerLabelHeight: 70,
      autoAdjustPointerLabelPosition: true,
      // pointerVanishDelay: 2000,

      // KEY CHANGES:
      activatePointersOnLongPress: true, // only long-press activates
      activatePointersDelay: 150,
      activatePointersOnDrag: false, // don't hijack normal scroll

      pointerLabelComponent: (items: any[]) => {
        const item = items?.[0];
        if (!item) return null;

        const idx =
          typeof item.index === "number"
            ? item.index
            : chartData.dates.findIndex(d => d === item.date);

        const workout = idx >= 0 ? history[idx] : undefined;
        const rawDate = workout?.date || item.date;
        const dateLabel = rawDate ? formatDate(rawDate) : "";
        const valueLabel = labelForValue(item);

        return (
          <View style={styles.tooltipPointerContainer}>
            {!!dateLabel && (
              <Text style={styles.tooltipTitle}>{dateLabel}</Text>
            )}
            <Text style={styles.tooltipValue}>{valueLabel}</Text>
          </View>
        );
      },
    });

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.tabContent}
      >
        {/* Best Set (1RM) */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Best Set (Estimated 1RM)</Text>
          <View style={styles.giftedChartWrapper}>
            <LineChart
              scrollToEnd
              data={best1RMData}
              height={220}
              hideRules
              hideYAxisText
              thickness={3}
              adjustToWidth
              curved
              isAnimated
              animationDuration={800}
              dataPointsHeight={8}
              dataPointsWidth={8}
              hideDataPoints={false}
              trimYAxisAtTop={true} // ★ key to avoid being cut at top
              pointerConfig={makeLinePointerConfig(item =>
                item.value ? `${item.value.toFixed(1)} kg` : "0 kg",
              )}
            />
          </View>
          <Text style={styles.chartUnit}>kg per workout</Text>
        </View>

        {/* Total Volume */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Total Volume</Text>
          <View style={styles.giftedChartWrapper}>
            <BarChart
              scrollToEnd
              yAxisExtraHeight={65}
              labelWidth={50}
              data={volumeData}
              leftShiftForLastIndexTooltip={50}
              height={220}
              barWidth={18}
              spacing={12}
              initialSpacing={18}
              hideRules
              hideYAxisText
              xAxisThickness={0}
              yAxisThickness={0}
              roundedBottom
              roundedTop
              isAnimated
              animationDuration={800}
              renderTooltip={renderBarTooltip}
              autoCenterTooltip
              activeOpacity={0.9}
            />
          </View>
          <Text style={styles.chartUnit}>kg × reps per workout</Text>
        </View>

        {/* PR Progression (1RM) */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>PR Progression (1RM)</Text>
          <View style={styles.giftedChartWrapper}>
            <LineChart
              scrollToEnd
              data={pr1RMData}
              height={220}
              hideRules
              hideYAxisText
              thickness={3}
              adjustToWidth
              curved
              isAnimated
              animationDuration={800}
              dataPointsHeight={8}
              dataPointsWidth={8}
              hideDataPoints={false}
              pointerConfig={makeLinePointerConfig(item =>
                item.value ? `${item.value.toFixed(1)} kg` : "0 kg",
              )}
            />
          </View>
          <Text style={styles.chartUnit}>All-time best so far (kg)</Text>
        </View>

        {/* Max Consecutive Reps */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Max Consecutive Reps</Text>
          <View style={styles.giftedChartWrapper}>
            <BarChart
              scrollToEnd
              yAxisExtraHeight={65}
              labelWidth={50}
              data={maxRepsData}
              leftShiftForLastIndexTooltip={50}
              height={220}
              barWidth={18}
              spacing={12}
              initialSpacing={18}
              hideRules
              hideYAxisText
              xAxisThickness={0}
              yAxisThickness={0}
              roundedBottom
              roundedTop
              isAnimated
              animationDuration={800}
              autoCenterTooltip
              renderTooltip={(item: any, index: number) => {
                if (!item) return null;
                const workout = history[index];
                const rawDate = workout?.date || item.date;
                const dateLabel = rawDate ? formatDate(rawDate) : "";
                const reps = item.value ?? 0;

                return (
                  <View style={styles.tooltipContainer}>
                    {dateLabel ? (
                      <Text style={styles.tooltipTitle}>{dateLabel}</Text>
                    ) : null}
                    {workout?.workout_name ? (
                      <Text style={styles.tooltipSubtitle}>
                        {workout.workout_name}
                      </Text>
                    ) : null}
                    <Text style={styles.tooltipValue}>{reps} reps</Text>
                  </View>
                );
              }}
              activeOpacity={0.9}
            />
          </View>
          <Text style={styles.chartUnit}>reps (best set per workout)</Text>
        </View>
      </ScrollView>
    );
  };

  const renderRecordsTab = () => (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.tabContent}>
      {loadingData ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <>
          <Text style={styles.recordsSectionTitle}>PERSONAL RECORDS</Text>

          <View style={styles.recordsCard}>
            <View style={styles.recordRow}>
              <Text style={styles.recordLabel}>Max Reps</Text>
              <Text style={styles.recordValue}>
                {records.maxReps > 0 ? `${records.maxReps} reps` : "—"}
              </Text>
            </View>

            <View style={styles.recordDivider} />

            <View style={styles.recordRow}>
              <Text style={styles.recordLabel}>Max Weight</Text>
              <Text style={styles.recordValue}>
                {records.maxWeight > 0 ? `${records.maxWeight} kg` : "—"}
              </Text>
            </View>

            <View style={styles.recordDivider} />

            <View style={styles.recordRow}>
              <Text style={styles.recordLabel}>Max Volume</Text>
              <Text style={styles.recordValue}>
                {records.maxVolume > 0 ? `${records.maxVolume} kg` : "—"}
              </Text>
            </View>

            <View style={styles.recordDivider} />

            <View style={styles.recordRow}>
              <Text style={styles.recordLabel}>Estimated 1RM</Text>
              <Text style={styles.recordValue}>
                {records.max1RM > 0 ? `${records.max1RM} kg` : "—"}
              </Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );

  if (!exercise) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={28} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {exercise.name}
          </Text>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleStartEditing}
          >
            <Text style={styles.editHeaderText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {(["about", "history", "charts", "records"] as TabType[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.tabTextActive,
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {activeTab === "about" && renderAboutTab()}
          {activeTab === "history" && renderHistoryTab()}
          {activeTab === "charts" && renderChartsTab()}
          {activeTab === "records" && renderRecordsTab()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F7",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  headerButton: {
    width: 50,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    flex: 1,
    textAlign: "center",
  },
  editHeaderText: {
    fontSize: 17,
    color: "#007AFF",
    fontWeight: "500",
    textAlign: "right",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "#E5E5EA",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#8E8E93",
  },
  tabTextActive: {
    color: "#1C1C1E",
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  loader: {
    marginTop: 40,
  },

  // About Tab Styles
  imageContainer: {
    width: "100%",
    height: 220,
    backgroundColor: "#E5E5EA",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholderOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  uploadImageButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  uploadImageText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  infoRow: {
    flexDirection: "row",
    gap: 8,
  },
  infoBadge: {
    backgroundColor: "#E5E5EA",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  infoBadgeText: {
    fontSize: 14,
    color: "#1C1C1E",
    fontWeight: "500",
  },
  customBadge: {
    backgroundColor: "#007AFF",
  },
  customBadgeText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  instructionsSection: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 16,
    color: "#3A3A3C",
    lineHeight: 24,
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
  },
  editLink: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 6,
  },
  editLinkText: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "500",
  },
  addInstructionsButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#007AFF",
    borderStyle: "dashed",
    gap: 8,
  },
  addInstructionsText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  editContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
  },
  instructionsInput: {
    fontSize: 16,
    color: "#1C1C1E",
    minHeight: 120,
    textAlignVertical: "top",
  },
  editButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
    paddingTop: 16,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#E5E5EA",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#007AFF",
    minWidth: 80,
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // History Tab Styles
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#8E8E93",
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#C7C7CC",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  historyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  historyHeader: {
    marginBottom: 12,
  },
  historyWorkoutName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  historyDate: {
    fontSize: 14,
    color: "#8E8E93",
    marginTop: 4,
  },
  setsPerformedLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8E8E93",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  historySetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5EA",
    gap: 6,
  },
  setDetails: {
    flex: 1,
    flexDirection: "row",
    gap: 16,
  },
  setMetric: {
    fontSize: 16,
    color: "#1C1C1E",
  },
  setTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#E5E5EA",
  },
  warmupBadge: {
    backgroundColor: "#FFD60A",
  },
  failureBadge: {
    backgroundColor: "#FF3B30",
  },
  setTypeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1C1C1E",
  },

  // Charts Tab Styles
  chartCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 16,
  },

  chartUnit: {
    fontSize: 12,
    color: "#8E8E93",
    textAlign: "right",
  },

  giftedChartWrapper: {
    marginTop: 4,
    marginBottom: 8,
    paddingTop: 24, // <— new
    paddingHorizontal: 8, // <— small side padding so edges feel less cramped
  },

  // Tooltip styles
  tooltipContainer: {
    // position: "absolute",
    // top: 0,
    // // left: -40,
    // transform: "translate(-50%,-100%)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#1C1C1E",
    borderRadius: 8,
  },
  tooltipPointerContainer: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#1C1C1E",
    borderRadius: 8,
  },
  tooltipTitle: {
    fontSize: 12,
    color: "#F5F5F7",
    marginBottom: 2,
  },
  tooltipSubtitle: {
    fontSize: 12,
    color: "#A1A1A7",
    marginBottom: 4,
  },
  tooltipValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Records Tab Styles
  recordsSectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8E8E93",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  recordsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  recordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
  },
  recordLabel: {
    fontSize: 16,
    color: "#1C1C1E",
  },
  recordValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  recordDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E5EA",
  },
  viewHistoryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  viewHistoryText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
    marginRight: 8,
  },
});
