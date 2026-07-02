import React, { useEffect, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { hapticSelect } from "../haptics";
import { ob } from "../theme";

const TICK_GAP = 14;

type Props = {
  min: number;
  max: number;
  value: number;
  unit: string;
  onChange: (v: number) => void;
};

/** Horizontal ruler the user drags; the value under the center pointer is selected. */
export default function RulerPicker({ min, max, value, unit, onChange }: Props) {
  const [w, setW] = useState(0);
  const ref = useRef<ScrollView>(null);
  const last = useRef(value);
  const ticks = max - min + 1;

  // Position the ruler at `value` once we know the container width.
  useEffect(() => {
    if (w > 0) {
      ref.current?.scrollTo({ x: (value - min) * TICK_GAP, animated: false });
    }
  }, [w]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / TICK_GAP);
    const v = Math.max(min, Math.min(max, min + idx));
    if (v !== last.current) {
      last.current = v;
      hapticSelect();
      onChange(v);
    }
  };

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={styles.readout}>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>

      <View style={styles.rulerBox}>
        <ScrollView
          ref={ref}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={TICK_GAP}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: w / 2 }}
        >
          {Array.from({ length: ticks }, (_, i) => {
            const major = (min + i) % 5 === 0;
            return (
              <View key={i} style={styles.tickSlot}>
                <View style={[styles.tick, major ? styles.tickMajor : null]} />
              </View>
            );
          })}
        </ScrollView>
        {/* center pointer */}
        <View pointerEvents="none" style={styles.pointer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch" },
  readout: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 6 },
  value: { fontSize: 38, fontWeight: "800", color: ob.ink, letterSpacing: -1 },
  unit: { fontSize: 16, fontWeight: "700", color: ob.textSoft, marginBottom: 7 },
  rulerBox: { height: 54, justifyContent: "center", marginTop: 6 },
  tickSlot: { width: TICK_GAP, alignItems: "center", justifyContent: "center" },
  tick: { width: 2, height: 18, borderRadius: 1, backgroundColor: "#C5D2E6" },
  tickMajor: { height: 34, backgroundColor: "#9DB2D4" },
  pointer: {
    position: "absolute",
    alignSelf: "center",
    width: 3,
    height: 44,
    borderRadius: 2,
    backgroundColor: ob.primary,
  },
});
