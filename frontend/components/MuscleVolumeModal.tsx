// components/MuscleVolumeModal.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../utils/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopExercise {
  name: string;
  hypertrophy_sets: number;
  strength_score: number;
  endurance_reps: number;
}

interface MuscleEntry {
  slug: string;
  name: string;
  level: number; // 0=group 1=muscle 2=head
  hypertrophy_sets: number;
  hypertrophy_sets_secondary: number;
  hypertrophy_sets_stabilizer: number;
  strength_score: number;
  endurance_reps: number;
  best_e1rm: number | null;
  top_exercises: TopExercise[];
}

interface MuscleVolumeResponse {
  days: number;
  weeks: number;
  start_date: string;
  end_date: string;
  workout_count: number;
  muscles: MuscleEntry[];
}

// ─── Hypertrophy thresholds (sets/week) ──────────────────────────────────────

interface Thresholds {
  mev: number;
  mav_low: number;
  mav_high: number;
  mrv: number;
}

function getThresholds(
  ta: "beginner" | "intermediate" | "advanced",
): Thresholds {
  switch (ta) {
    case "beginner":
      return { mev: 4, mav_low: 6, mav_high: 12, mrv: 16 };
    case "advanced":
      return { mev: 8, mav_low: 12, mav_high: 22, mrv: 28 };
    default:
      return { mev: 6, mav_low: 10, mav_high: 18, mrv: 22 };
  }
}

type Zone = "undertraining" | "mev" | "optimal" | "overreaching" | "nfo";

function getZone(sets: number, t: Thresholds): Zone {
  if (sets < t.mev) return "undertraining";
  if (sets < t.mav_low) return "mev";
  if (sets <= t.mav_high) return "optimal";
  if (sets <= t.mrv) return "overreaching";
  return "nfo";
}

const ZONE_COLOR: Record<Zone, string> = {
  undertraining: "#C7C7CC",
  mev: "#FF9500",
  optimal: "#34C759",
  overreaching: "#007AFF",
  nfo: "#FF3B30",
};
const ZONE_LABEL: Record<Zone, string> = {
  undertraining: "Undertraining",
  mev: "Minimum Volume",
  optimal: "Optimal",
  overreaching: "Overreaching",
  nfo: "Too Much",
};

// ─── Muscle group hierarchy (mirrors body_parts.py, groups only) ──────────────
// Used for the heatmap layout and drill-down selector

const MUSCLE_GROUPS = [
  { slug: "chest", name: "Chest", emoji: "💪" },
  { slug: "back", name: "Back", emoji: "🔙" },
  { slug: "shoulders", name: "Shoulders", emoji: "🏋️" },
  { slug: "arms", name: "Arms", emoji: "💪" },
  { slug: "core", name: "Core", emoji: "⚡" },
  { slug: "legs", name: "Legs", emoji: "🦵" },
  { slug: "neck", name: "Neck", emoji: "🦷" },
];

// ─── Training age map ─────────────────────────────────────────────────────────

type RawTA = "new" | "1-2y" | "2-5y" | "5y+" | null | undefined;
function mapTA(raw: RawTA): "beginner" | "intermediate" | "advanced" {
  if (!raw || raw === "new") return "beginner";
  if (raw === "1-2y" || raw === "2-5y") return "intermediate";
  return "advanced";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEFRAMES = [
  { label: "1W", days: 7 },
  { label: "2W", days: 14 },
  { label: "4W", days: 28 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "All", days: 730 },
];

type MetricKey = "hypertrophy" | "strength" | "endurance";

const METRIC_CONFIG: Record<
  MetricKey,
  { label: string; color: string; unit: string }
> = {
  hypertrophy: { label: "Hypertrophy", color: "#34C759", unit: "sets/wk" },
  strength: { label: "Strength", color: "#FF3B30", unit: "kg·i/wk" },
  endurance: { label: "Endurance", color: "#FF9500", unit: "reps/wk" },
};

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function Heatmap({
  data,
  thresholds,
  metric,
  onSelectGroup,
}: {
  data: MuscleVolumeResponse;
  thresholds: Thresholds;
  metric: MetricKey;
  onSelectGroup: (slug: string) => void;
}) {
  const bySlug = useMemo(() => {
    const map: Record<string, MuscleEntry> = {};
    for (const m of data.muscles) map[m.slug] = m;
    return map;
  }, [data]);

  function getMetricValue(m: MuscleEntry): number {
    if (metric === "hypertrophy") return m.hypertrophy_sets;
    if (metric === "strength") return m.strength_score;
    return m.endurance_reps;
  }

  function getCellColor(slug: string): string {
    const m = bySlug[slug];
    if (!m) return "#F2F2F7";
    const val = getMetricValue(m);
    if (val === 0) return "#F2F2F7";
    if (metric === "hypertrophy") {
      return ZONE_COLOR[getZone(val, thresholds)];
    }
    // For strength/endurance: intensity-based green scale
    const groups = data.muscles.filter(x => x.level === 0);
    const max = Math.max(...groups.map(x => getMetricValue(x)), 1);
    const pct = Math.min(val / max, 1);
    if (pct < 0.2) return "#C7C7CC";
    if (pct < 0.4) return "#FF9500";
    if (pct < 0.7) return "#34C759AA";
    return "#34C759";
  }

  function getDisplayValue(slug: string): string {
    const m = bySlug[slug];
    if (!m) return "0";
    const val = getMetricValue(m);
    if (val === 0) return "0";
    if (metric === "strength")
      return val > 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0);
    return val.toFixed(1);
  }

  // Layout: 2 columns of group tiles
  const rows: (typeof MUSCLE_GROUPS)[] = [];
  for (let i = 0; i < MUSCLE_GROUPS.length; i += 2) {
    rows.push(MUSCLE_GROUPS.slice(i, i + 2));
  }

  const tileW = (SCREEN_W - 32 - 12) / 2; // 16px padding each side, 12px gap

  return (
    <View style={heatStyles.container}>
      {rows.map((row, ri) => (
        <View key={ri} style={heatStyles.row}>
          {row.map(group => {
            const color = getCellColor(group.slug);
            const val = getDisplayValue(group.slug);
            const m = bySlug[group.slug];
            const zone: Zone | null = (() => {
              if (!m) return null;
              if (metric === "hypertrophy")
                return getZone(m.hypertrophy_sets, thresholds);
              // For strength/endurance: relative zone based on % of max across all groups
              const allGroups = data.muscles.filter(x => x.level === 0);
              const vals = allGroups.map(x =>
                metric === "strength" ? x.strength_score : x.endurance_reps,
              );
              const max = Math.max(...vals, 1);
              const val =
                metric === "strength" ? m.strength_score : m.endurance_reps;
              const pct = val / max;
              if (pct === 0) return "undertraining";
              if (pct < 0.3) return "mev";
              if (pct < 0.7) return "optimal";
              if (pct < 0.9) return "overreaching";
              return "nfo";
            })();

            return (
              <TouchableOpacity
                key={group.slug}
                style={[
                  heatStyles.tile,
                  {
                    width: tileW,
                    backgroundColor: color + "33",
                    borderColor: color,
                  },
                ]}
                onPress={() => onSelectGroup(group.slug)}
                activeOpacity={0.75}
              >
                <View
                  style={[heatStyles.tileAccent, { backgroundColor: color }]}
                />
                <Text style={heatStyles.tileName}>{group.name}</Text>
                <Text style={[heatStyles.tileValue, { color }]}>{val}</Text>
                <Text style={heatStyles.tileUnit}>
                  {METRIC_CONFIG[metric].unit}
                </Text>
                {zone && (
                  <View
                    style={[
                      heatStyles.zonePill,
                      { backgroundColor: color + "22" },
                    ]}
                  >
                    <Text style={[heatStyles.zonePillText, { color }]}>
                      {ZONE_LABEL[zone]}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
          {/* Fill empty slot if odd number */}
          {row.length === 1 && <View style={{ width: tileW }} />}
        </View>
      ))}
    </View>
  );
}

// ─── Metric bar ───────────────────────────────────────────────────────────────

function MetricBar({
  hyp,
  str,
  end,
}: {
  hyp: number;
  str: number;
  end: number;
}) {
  const total = hyp + str + end;
  if (total === 0) return null;
  const hPct = (hyp / total) * 100;
  const sPct = (str / total) * 100;
  const ePct = (end / total) * 100;
  return (
    <View>
      <View style={metricStyles.bar}>
        <View
          style={[
            metricStyles.seg,
            { width: `${hPct}%`, backgroundColor: "#34C759" },
          ]}
        />
        <View
          style={[
            metricStyles.seg,
            { width: `${sPct}%`, backgroundColor: "#FF3B30" },
          ]}
        />
        <View
          style={[
            metricStyles.seg,
            { width: `${ePct}%`, backgroundColor: "#FF9500" },
          ]}
        />
      </View>
      <View style={metricStyles.legend}>
        {[
          { label: `Hyp ${hPct.toFixed(0)}%`, color: "#34C759" },
          { label: `Str ${sPct.toFixed(0)}%`, color: "#FF3B30" },
          { label: `End ${ePct.toFixed(0)}%`, color: "#FF9500" },
        ].map(x => (
          <View key={x.label} style={metricStyles.legendItem}>
            <View style={[metricStyles.dot, { backgroundColor: x.color }]} />
            <Text style={metricStyles.legendText}>{x.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── RangeBar (hypertrophy only) ──────────────────────────────────────────────

function RangeBar({ sets, t }: { sets: number; t: Thresholds }) {
  const max = t.mrv * 1.5;
  const zone = getZone(sets, t);
  const color = ZONE_COLOR[zone];
  const fillPct = Math.min(sets / max, 1) * 100;
  const m1 = (t.mev / max) * 100;
  const m2 = (t.mav_low / max) * 100;
  const m3 = (t.mav_high / max) * 100;
  const m4 = (t.mrv / max) * 100;

  return (
    <View>
      <View style={rangeStyles.track}>
        <View
          style={[
            rangeStyles.zone,
            { left: 0, width: `${m1}%`, backgroundColor: "#C7C7CC18" },
          ]}
        />
        <View
          style={[
            rangeStyles.zone,
            {
              left: `${m1}%`,
              width: `${m2 - m1}%`,
              backgroundColor: "#FF950018",
            },
          ]}
        />
        <View
          style={[
            rangeStyles.zone,
            {
              left: `${m2}%`,
              width: `${m3 - m2}%`,
              backgroundColor: "#34C75918",
            },
          ]}
        />
        <View
          style={[
            rangeStyles.zone,
            {
              left: `${m3}%`,
              width: `${m4 - m3}%`,
              backgroundColor: "#007AFF18",
            },
          ]}
        />
        <View
          style={[
            rangeStyles.zone,
            { left: `${m4}%`, right: 0, backgroundColor: "#FF3B3018" },
          ]}
        />
        <View
          style={[
            rangeStyles.fill,
            { width: `${fillPct}%`, backgroundColor: color },
          ]}
        />
        {[m1, m2, m3, m4].map((m, i) => (
          <View key={i} style={[rangeStyles.marker, { left: `${m}%` }]} />
        ))}
      </View>
      <View style={rangeStyles.row}>
        <Text style={rangeStyles.val}>{sets.toFixed(1)} sets/wk</Text>
        <View style={[rangeStyles.badge, { backgroundColor: color + "22" }]}>
          <Text style={[rangeStyles.badgeText, { color }]}>
            {ZONE_LABEL[zone]}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Muscle detail card ───────────────────────────────────────────────────────

function MuscleDetailCard({
  muscle,
  thresholds,
  expanded,
  onPress,
}: {
  muscle: MuscleEntry;
  thresholds: Thresholds;
  expanded: boolean;
  onPress: () => void;
}) {
  const zone = getZone(muscle.hypertrophy_sets, thresholds);
  const color = ZONE_COLOR[zone];

  return (
    <TouchableOpacity
      style={cardStyles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Header row */}
      <View style={cardStyles.header}>
        <View style={[cardStyles.dot, { backgroundColor: color }]} />
        <Text style={cardStyles.name}>{muscle.name}</Text>
        {muscle.best_e1rm && (
          <Text style={cardStyles.e1rm}>
            {muscle.best_e1rm.toFixed(1)} kg e1RM
          </Text>
        )}
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color="#8E8E93"
        />
      </View>

      {/* Hypertrophy range bar always visible */}
      <RangeBar sets={muscle.hypertrophy_sets} t={thresholds} />

      {expanded && (
        <View style={cardStyles.body}>
          <View style={cardStyles.divider} />

          {/* 3 metric stats */}
          <View style={cardStyles.statRow}>
            <View style={cardStyles.stat}>
              <Text style={[cardStyles.statVal, { color: "#34C759" }]}>
                {muscle.hypertrophy_sets.toFixed(1)}
              </Text>
              <Text style={cardStyles.statLabel}>Hyp sets/wk</Text>
            </View>
            <View style={cardStyles.stat}>
              <Text style={[cardStyles.statVal, { color: "#FF3B30" }]}>
                {muscle.strength_score > 1000
                  ? `${(muscle.strength_score / 1000).toFixed(1)}k`
                  : muscle.strength_score.toFixed(0)}
              </Text>
              <Text style={cardStyles.statLabel}>Str score/wk</Text>
            </View>
            <View style={cardStyles.stat}>
              <Text style={[cardStyles.statVal, { color: "#FF9500" }]}>
                {muscle.endurance_reps.toFixed(0)}
              </Text>
              <Text style={cardStyles.statLabel}>End reps/wk</Text>
            </View>
            <View style={cardStyles.stat}>
              <Text style={cardStyles.statVal}>
                {muscle.hypertrophy_sets_secondary.toFixed(1)}
              </Text>
              <Text style={cardStyles.statLabel}>Secondary</Text>
            </View>
          </View>

          {/* Load type split bar */}
          <Text style={cardStyles.sectionLabel}>LOAD TYPE SPLIT</Text>
          <MetricBar
            hyp={muscle.hypertrophy_sets}
            str={muscle.strength_score / 500} // normalise to same rough scale
            end={muscle.endurance_reps / 50}
          />

          {/* Top exercises */}
          {muscle.top_exercises.length > 0 && (
            <>
              <Text style={cardStyles.sectionLabel}>TOP EXERCISES</Text>
              {muscle.top_exercises.map((ex, i) => (
                <View key={i} style={cardStyles.exRow}>
                  <Text style={cardStyles.exName} numberOfLines={1}>
                    {ex.name}
                  </Text>
                  <View style={cardStyles.exStats}>
                    <Text style={[cardStyles.exStat, { color: "#34C759" }]}>
                      {ex.hypertrophy_sets.toFixed(1)}s
                    </Text>
                    {ex.strength_score > 0 && (
                      <Text style={[cardStyles.exStat, { color: "#FF3B30" }]}>
                        {ex.strength_score > 1000
                          ? `${(ex.strength_score / 1000).toFixed(1)}k`
                          : ex.strength_score.toFixed(0)}
                        i
                      </Text>
                    )}
                    {ex.endurance_reps > 0 && (
                      <Text style={[cardStyles.exStat, { color: "#FF9500" }]}>
                        {ex.endurance_reps.toFixed(0)}r
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function MuscleVolumeModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [days, setDays] = useState(28);
  const [data, setData] = useState<MuscleVolumeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trainingAge, setTA] = useState<
    "beginner" | "intermediate" | "advanced"
  >("intermediate");
  const [metric, setMetric] = useState<MetricKey>("hypertrophy");

  // Drill-down state
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  // Tab: "heatmap" | "detail"
  const [tab, setTab] = useState<"heatmap" | "detail">("heatmap");

  // ── Fetch profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    api
      .get("/profile")
      .then(r => setTA(mapTA(r.data?.training_age)))
      .catch(() => {});
  }, [visible]);

  // ── Fetch volume ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get(`/analytics/muscle-volume?days=${days}`)
      .then(r => {
        if (!cancelled) setData(r.data as unknown as MuscleVolumeResponse);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, days]);

  const thresholds = getThresholds(trainingAge);

  // ── Derived muscle lists ───────────────────────────────────────────────────
  const bySlug = useMemo(() => {
    const map: Record<string, MuscleEntry> = {};
    if (data) for (const m of data.muscles) map[m.slug] = m;
    return map;
  }, [data]);

  // Groups for heatmap summary stats
  const groupSummary = useMemo(() => {
    if (!data) return { optimal: 0, under: 0, over: 0 };
    const groups = data.muscles.filter(m => m.level === 0);
    return {
      optimal: groups.filter(
        m => getZone(m.hypertrophy_sets, thresholds) === "optimal",
      ).length,
      under: groups.filter(m =>
        ["undertraining", "mev"].includes(
          getZone(m.hypertrophy_sets, thresholds),
        ),
      ).length,
      over: groups.filter(m =>
        ["overreaching", "nfo"].includes(
          getZone(m.hypertrophy_sets, thresholds),
        ),
      ).length,
    };
  }, [data, thresholds]);

  // Muscles within selected group (level=1)
  const musclesInGroup = useMemo(() => {
    if (!data || !selectedGroup) return [];
    // Use slug prefix matching since we know the tree structure
    // level=1 muscles whose ancestor is selectedGroup
    return data.muscles.filter(
      m => m.level === 1 && isDescendantOf(m.slug, selectedGroup),
    );
  }, [data, selectedGroup]);

  // Heads within selected muscle (level=2)
  const headsInMuscle = useMemo(() => {
    if (!data || !selectedMuscle) return [];
    return data.muscles.filter(
      m => m.level === 2 && isDescendantOf(m.slug, selectedMuscle),
    );
  }, [data, selectedMuscle]);

  // Active list for detail tab
  const detailList = useMemo(() => {
    if (!data) return [];
    if (selectedMuscle) {
      // Show the muscle + its heads
      const muscle = bySlug[selectedMuscle];
      const heads = headsInMuscle;
      return muscle ? [muscle, ...heads] : heads;
    }
    if (selectedGroup) {
      return musclesInGroup;
    }
    // No selection: show all level=0 groups
    return data.muscles.filter(m => m.level === 0);
  }, [
    data,
    selectedGroup,
    selectedMuscle,
    musclesInGroup,
    headsInMuscle,
    bySlug,
  ]);

  const toggleExpand = useCallback(
    (slug: string) => setExpandedSlug(p => (p === slug ? null : slug)),
    [],
  );

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setData(null);
      setSelectedGroup(null);
      setSelectedMuscle(null);
      setExpandedSlug(null);
      setTab("heatmap");
      setDays(28);
    }, 300);
  };

  const handleSelectGroup = (slug: string) => {
    setSelectedGroup(slug);
    setSelectedMuscle(null);
    setExpandedSlug(null);
    setTab("detail");
  };

  const handleSelectMuscle = (slug: string) => {
    setSelectedMuscle(slug);
    setExpandedSlug(null);
  };

  const handleBack = () => {
    if (selectedMuscle) {
      setSelectedMuscle(null);
      setExpandedSlug(null);
    } else if (selectedGroup) {
      setSelectedGroup(null);
      setTab("heatmap");
    }
  };

  // Breadcrumb label
  const breadcrumb = useMemo(() => {
    if (selectedMuscle) {
      const g = MUSCLE_GROUPS.find(x => x.slug === selectedGroup);
      const m = bySlug[selectedMuscle];
      return `${g?.name ?? ""} › ${m?.name ?? ""}`;
    }
    if (selectedGroup) {
      return MUSCLE_GROUPS.find(x => x.slug === selectedGroup)?.name ?? "";
    }
    return null;
  }, [selectedGroup, selectedMuscle, bySlug]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="close" size={26} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.title}>Muscle Volume</Text>
          <View style={styles.headerBtn} />
        </View>

        {/* ── Timeframe chips ── */}
        <View style={styles.tfRow}>
          {TIMEFRAMES.map(tf => (
            <TouchableOpacity
              key={tf.days}
              style={[styles.chip, days === tf.days && styles.chipActive]}
              onPress={() => setDays(tf.days)}
            >
              <Text
                style={[
                  styles.chipText,
                  days === tf.days && styles.chipTextActive,
                ]}
              >
                {tf.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tab switcher ── */}
        <View style={styles.tabRow}>
          {(["heatmap", "detail"] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => {
                setTab(t);
                if (t === "heatmap") {
                  setSelectedGroup(null);
                  setSelectedMuscle(null);
                }
              }}
            >
              <Ionicons
                name={t === "heatmap" ? "grid-outline" : "list-outline"}
                size={16}
                color={tab === t ? "#007AFF" : "#8E8E93"}
              />
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === "heatmap" ? "Heatmap" : "Detail"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: "#E5E5EA",
          }}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Loading / Error ── */}
          {loading && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Analysing your training…</Text>
            </View>
          )}
          {!loading && error && (
            <View style={styles.center}>
              <Ionicons name="alert-circle-outline" size={48} color="#FF3B30" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!loading && !error && data && (
            <>
              {/* ── HEATMAP TAB ── */}
              {tab === "heatmap" && (
                <>
                  {/* Summary strip */}
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryNum}>
                        {data.workout_count}
                      </Text>
                      <Text style={styles.summaryLabel}>Workouts</Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text
                        style={[
                          styles.summaryNum,
                          { color: ZONE_COLOR.optimal },
                        ]}
                      >
                        {groupSummary.optimal}
                      </Text>
                      <Text style={styles.summaryLabel}>Optimal</Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text
                        style={[styles.summaryNum, { color: ZONE_COLOR.mev }]}
                      >
                        {groupSummary.under}
                      </Text>
                      <Text style={styles.summaryLabel}>Under</Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text
                        style={[
                          styles.summaryNum,
                          { color: ZONE_COLOR.overreaching },
                        ]}
                      >
                        {groupSummary.over}
                      </Text>
                      <Text style={styles.summaryLabel}>Over</Text>
                    </View>
                  </View>

                  {/* Metric selector */}
                  <View style={styles.metricRow}>
                    {(Object.keys(METRIC_CONFIG) as MetricKey[]).map(mk => (
                      <TouchableOpacity
                        key={mk}
                        style={[
                          styles.metricChip,
                          metric === mk && {
                            backgroundColor: METRIC_CONFIG[mk].color + "22",
                            borderColor: METRIC_CONFIG[mk].color,
                          },
                        ]}
                        onPress={() => setMetric(mk)}
                      >
                        <Text
                          style={[
                            styles.metricChipText,
                            metric === mk && {
                              color: METRIC_CONFIG[mk].color,
                              fontWeight: "600",
                            },
                          ]}
                        >
                          {METRIC_CONFIG[mk].label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Zone legend */}
                  <View style={styles.legendWrap}>
                    {(Object.entries(ZONE_LABEL) as [Zone, string][]).map(
                      ([z, l]) => (
                        <View key={z} style={styles.legendItem}>
                          <View
                            style={[
                              styles.legendDot,
                              { backgroundColor: ZONE_COLOR[z] },
                            ]}
                          />
                          <Text style={styles.legendText}>{l}</Text>
                        </View>
                      ),
                    )}
                  </View>

                  {/* Heatmap grid */}
                  <Heatmap
                    data={data}
                    thresholds={thresholds}
                    metric={metric}
                    onSelectGroup={handleSelectGroup}
                  />

                  <Text style={styles.heatmapHint}>
                    Tap a group to drill down →
                  </Text>
                </>
              )}

              {/* ── DETAIL TAB ── */}
              {tab === "detail" && (
                <>
                  {/* Breadcrumb + back */}
                  {breadcrumb && (
                    <View style={styles.breadcrumb}>
                      <TouchableOpacity
                        onPress={handleBack}
                        style={styles.backBtn}
                      >
                        <Ionicons
                          name="chevron-back"
                          size={20}
                          color="#007AFF"
                        />
                        <Text style={styles.backText}>Back</Text>
                      </TouchableOpacity>
                      <Text style={styles.breadcrumbText}>{breadcrumb}</Text>
                    </View>
                  )}

                  {/* Group chips (level 0 → level 1 drill-down) */}
                  {!selectedGroup && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.chipRow}
                      contentContainerStyle={styles.tfContent}
                    >
                      {MUSCLE_GROUPS.map(g => (
                        <TouchableOpacity
                          key={g.slug}
                          style={[
                            styles.chip,
                            selectedGroup === g.slug && styles.chipActive,
                          ]}
                          onPress={() => handleSelectGroup(g.slug)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              selectedGroup === g.slug && styles.chipTextActive,
                            ]}
                          >
                            {g.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  {/* Muscle chips within group (level 1 → level 2) */}
                  {selectedGroup &&
                    !selectedMuscle &&
                    musclesInGroup.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.chipRow}
                        contentContainerStyle={styles.tfContent}
                      >
                        {musclesInGroup.map(m => {
                          const zone = getZone(m.hypertrophy_sets, thresholds);
                          return (
                            <TouchableOpacity
                              key={m.slug}
                              style={[
                                styles.chip,
                                { borderColor: ZONE_COLOR[zone] },
                              ]}
                              onPress={() => handleSelectMuscle(m.slug)}
                            >
                              <View
                                style={[
                                  styles.chipDot,
                                  { backgroundColor: ZONE_COLOR[zone] },
                                ]}
                              />
                              <Text style={styles.chipText}>{m.name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}

                  {/* Cards */}
                  {detailList.map(muscle => (
                    <MuscleDetailCard
                      key={muscle.slug}
                      muscle={muscle}
                      thresholds={thresholds}
                      expanded={expandedSlug === muscle.slug}
                      onPress={() => toggleExpand(muscle.slug)}
                    />
                  ))}

                  {detailList.length === 0 && (
                    <View style={styles.center}>
                      <Ionicons
                        name="barbell-outline"
                        size={48}
                        color="#C7C7CC"
                      />
                      <Text style={styles.emptyText}>
                        No data for this selection
                      </Text>
                    </View>
                  )}
                </>
              )}

              <View style={{ height: 48 }} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Helper: is slug a descendant of ancestorSlug in the muscle tree ──────────
// Simple approach: check if the MUSCLE_MAP entry for slug has ancestorSlug
// in its ancestor chain. We replicate the logic from body_parts.py here.

const DESCENDANT_MAP: Record<string, string[]> = {
  // chest
  "pec-major": ["chest"],
  "pec-major-upper": ["chest", "pec-major"],
  "pec-major-mid": ["chest", "pec-major"],
  "pec-major-lower": ["chest", "pec-major"],
  "pec-minor": ["chest"],
  // back
  lats: ["back"],
  "lats-upper": ["back", "lats"],
  "lats-lower": ["back", "lats"],
  traps: ["back"],
  "traps-upper": ["back", "traps"],
  "traps-mid": ["back", "traps"],
  "traps-lower": ["back", "traps"],
  rhomboids: ["back"],
  "erector-spinae": ["back"],
  "erector-spinae-upper": ["back", "erector-spinae"],
  "erector-spinae-lower": ["back", "erector-spinae"],
  "teres-major": ["back"],
  "rear-delt": ["back"],
  // shoulders
  deltoid: ["shoulders"],
  "deltoid-front": ["shoulders", "deltoid"],
  "deltoid-side": ["shoulders", "deltoid"],
  "deltoid-rear": ["shoulders", "deltoid"],
  "rotator-cuff": ["shoulders"],
  // arms
  biceps: ["arms"],
  "biceps-long-head": ["arms", "biceps"],
  "biceps-short-head": ["arms", "biceps"],
  brachialis: ["arms"],
  triceps: ["arms"],
  "triceps-long-head": ["arms", "triceps"],
  "triceps-lateral-head": ["arms", "triceps"],
  "triceps-medial-head": ["arms", "triceps"],
  forearms: ["arms"],
  "forearms-flexors": ["arms", "forearms"],
  "forearms-extensors": ["arms", "forearms"],
  brachioradialis: ["arms", "forearms"],
  // core
  abs: ["core"],
  "abs-upper": ["core", "abs"],
  "abs-lower": ["core", "abs"],
  obliques: ["core"],
  "obliques-internal": ["core", "obliques"],
  "obliques-external": ["core", "obliques"],
  "transverse-abdominis": ["core"],
  "serratus-anterior": ["core"],
  // legs
  quads: ["legs"],
  "quads-rectus-femoris": ["legs", "quads"],
  "quads-vastus-lateralis": ["legs", "quads"],
  "quads-vastus-medialis": ["legs", "quads"],
  "quads-vastus-intermedius": ["legs", "quads"],
  hamstrings: ["legs"],
  "hamstrings-biceps-femoris": ["legs", "hamstrings"],
  "hamstrings-semitendinosus": ["legs", "hamstrings"],
  "hamstrings-semimembranosus": ["legs", "hamstrings"],
  glutes: ["legs"],
  "glutes-maximus": ["legs", "glutes"],
  "glutes-medius": ["legs", "glutes"],
  "glutes-minimus": ["legs", "glutes"],
  adductors: ["legs"],
  abductors: ["legs"],
  "hip-flexors": ["legs"],
  "hip-flexors-psoas": ["legs", "hip-flexors"],
  "hip-flexors-iliacus": ["legs", "hip-flexors"],
  "hip-flexors-rectus-femoris": ["legs", "hip-flexors"],
  "hip-flexors-tfl": ["legs", "hip-flexors"],
  "deep-hip-rotators": ["legs"],
  piriformis: ["legs", "deep-hip-rotators"],
  obturator: ["legs", "deep-hip-rotators"],
  gemelli: ["legs", "deep-hip-rotators"],
  "quadratus-femoris": ["legs", "deep-hip-rotators"],
  calves: ["legs"],
  gastrocnemius: ["legs", "calves"],
  "gastrocnemius-medial": ["legs", "calves", "gastrocnemius"],
  "gastrocnemius-lateral": ["legs", "calves", "gastrocnemius"],
  soleus: ["legs", "calves"],
  "tibialis-anterior": ["legs", "calves"],
  "lower-leg": ["legs"],
  foot: ["legs"],
  // neck
  sternocleidomastoid: ["neck"],
  "neck-flexors": ["neck"],
  "neck-extensors": ["neck"],
  scalenes: ["neck"],
  splenius: ["neck"],
};

function isDescendantOf(slug: string, ancestorSlug: string): boolean {
  const ancestors = DESCENDANT_MAP[slug];
  return ancestors ? ancestors.includes(ancestorSlug) : false;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F7", flexDirection: "column" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5EA",
  },
  headerBtn: { width: 44, alignItems: "flex-start" },
  title: { fontSize: 17, fontWeight: "600", color: "#1C1C1E" },
  tfRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 8,
  },
  chipRow: { marginTop: 8 },
  tfContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: "center",
    height: 40,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E5EA",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipActive: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  chipText: { fontSize: 14, fontWeight: "500", color: "#3A3A3C" },
  chipTextActive: { color: "#FFF", fontWeight: "600" },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 0,
    backgroundColor: "#E5E5EA",
    borderRadius: 10,
    padding: 2,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  tabActive: { backgroundColor: "#FFF" },
  tabText: { fontSize: 14, fontWeight: "500", color: "#8E8E93" },
  tabTextActive: { color: "#007AFF", fontWeight: "600" },
  scroll: { flex: 1, marginTop: 0 },
  scrollContent: { paddingTop: 0, paddingBottom: 24 },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: { fontSize: 15, color: "#8E8E93", marginTop: 12 },
  errorText: { fontSize: 15, color: "#FF3B30", marginTop: 12 },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8E8E93",
    marginTop: 16,
  },
  summaryRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    marginTop: 0,
    justifyContent: "space-around",
  },
  summaryItem: { alignItems: "center" },
  summaryNum: { fontSize: 22, fontWeight: "700", color: "#1C1C1E" },
  summaryLabel: { fontSize: 12, color: "#8E8E93", marginTop: 2 },
  metricRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 6,
    gap: 8,
  },
  metricChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  metricChipText: { fontSize: 12, fontWeight: "500", color: "#3A3A3C" },
  legendContent: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  legendWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 6,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: "#3A3A3C" },
  heatmapHint: {
    textAlign: "center",
    fontSize: 12,
    color: "#C7C7CC",
    marginTop: 8,
  },
  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  backBtn: { flexDirection: "row", alignItems: "center", marginRight: 8 },
  backText: { fontSize: 15, color: "#007AFF" },
  breadcrumbText: { fontSize: 14, color: "#8E8E93", fontWeight: "500" },
});

const heatStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, gap: 12 },
  row: { flexDirection: "row", gap: 12 },
  tile: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    overflow: "hidden",
    position: "relative",
  },
  tileAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  tileName: { fontSize: 15, fontWeight: "600", color: "#1C1C1E", marginTop: 4 },
  tileValue: { fontSize: 28, fontWeight: "700", marginTop: 4 },
  tileUnit: { fontSize: 11, color: "#8E8E93", marginTop: 0 },
  zonePill: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  zonePillText: { fontSize: 10, fontWeight: "600" },
});

const cardStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, fontSize: 16, fontWeight: "600", color: "#1C1C1E" },
  e1rm: { fontSize: 12, color: "#8E8E93", marginRight: 4 },
  body: { marginTop: 8 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E5EA",
    marginBottom: 12,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  stat: { alignItems: "center" },
  statVal: { fontSize: 18, fontWeight: "700", color: "#1C1C1E" },
  statLabel: { fontSize: 10, color: "#8E8E93", marginTop: 2 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#8E8E93",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 8,
  },
  exRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F2F2F7",
  },
  exName: { flex: 1, fontSize: 14, color: "#3A3A3C" },
  exStats: { flexDirection: "row", gap: 8, marginLeft: 8 },
  exStat: { fontSize: 12, fontWeight: "600" },
});

const rangeStyles = StyleSheet.create({
  track: {
    height: 8,
    backgroundColor: "#F2F2F7",
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
  },
  zone: { position: "absolute", top: 0, bottom: 0 },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 4 },
  marker: {
    position: "absolute",
    top: -2,
    bottom: -2,
    width: 1.5,
    backgroundColor: "#FFF",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  val: { fontSize: 12, color: "#3A3A3C", fontWeight: "500" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: "600" },
});

const metricStyles = StyleSheet.create({
  bar: {
    height: 6,
    borderRadius: 3,
    flexDirection: "row",
    overflow: "hidden",
    backgroundColor: "#F2F2F7",
    marginBottom: 6,
  },
  seg: { height: "100%" },
  legend: { flexDirection: "row", gap: 12, marginBottom: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 11, color: "#3A3A3C" },
});
