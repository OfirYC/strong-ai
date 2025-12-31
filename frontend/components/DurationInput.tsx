import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  TextInput,
  StyleSheet,
  StyleProp,
  TextStyle,
  Platform,
} from "react-native";

interface DurationInputProps {
  value: number; // value in seconds (can be decimal when using ms)
  onChangeValue: (seconds: number) => void;
  style?: StyleProp<TextStyle>;
  onChangeFocus?: (focused: boolean) => void;
  enableMilliseconds?: boolean;
  autoFocus?: boolean;
}

const pad2 = (n: number | string) => n.toString().padStart(2, "0");

// -----------------------------------
// value (seconds) -> 'calculator digits'
// -----------------------------------
export function formatDurationValueToDigitString(
  value: number,
  enableMilliseconds: boolean
): string {
  if (!Number.isFinite(value) || value <= 0) return "";

  if (enableMilliseconds) {
    const totalCentis = Math.round(value * 100);

    const centis = totalCentis % 100;
    const totalSeconds = Math.floor(totalCentis / 100);

    const secs = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);

    const mins = totalMinutes % 60;
    const hrs = Math.floor(totalMinutes / 60);

    let digits = "";
    if (hrs > 0) {
      digits = `${hrs}${pad2(mins)}${pad2(secs)}${pad2(centis)}`;
    } else if (mins > 0) {
      digits = `${mins}${pad2(secs)}${pad2(centis)}`;
    } else if (secs > 0) {
      digits = `${secs}${pad2(centis)}`;
    } else {
      digits = `${centis}`;
    }

    return digits.replace(/^0+/, "") || "";
  }

  // seconds-only mode
  const totalSecs = Math.round(value);
  const secs = totalSecs % 60;
  const totalMinutes = Math.floor(totalSecs / 60);
  const mins = totalMinutes % 60;
  const hrs = Math.floor(totalMinutes / 60);

  let digits = "";
  if (hrs > 0) {
    digits = `${hrs}${pad2(mins)}${pad2(secs)}`;
  } else if (mins > 0) {
    digits = `${mins}${pad2(secs)}`;
  } else {
    digits = `${secs}`;
  }

  return digits.replace(/^0+/, "") || "";
}

// -----------------------------------
// raw digits -> formatted time string
// -----------------------------------
export const formatDigitsToTime = (
  digits: string,
  enableMilliseconds: boolean
): string => {
  const clean = digits.replace(/\D/g, "");
  if (!clean) return enableMilliseconds ? "0:00.00" : "0:00";

  if (enableMilliseconds) {
    const cStr = clean.slice(-2) || "0";
    const sStr = clean.length > 2 ? clean.slice(-4, -2) : "0";
    const mStr = clean.length > 4 ? clean.slice(-6, -4) : "0";
    const hStr = clean.length > 6 ? clean.slice(0, -6) : "";

    const c = parseInt(cStr, 10) || 0;
    const s = parseInt(sStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    const h = hStr ? parseInt(hStr, 10) || 0 : 0;

    // NEW: nicer display rules for ms mode
    if (h > 0) {
      // H:MM:SS.cc
      return `${h}:${pad2(m)}:${pad2(s)}.${pad2(c)}`;
    }
    if (m > 0) {
      // M:SS.cc
      return `${m}:${pad2(s)}.${pad2(c)}`;
    }
    // seconds only: S.cc (no leading "0:")
    return `${s}.${pad2(c)}`;
  }

  // seconds-only
  const sStr = clean.slice(-2) || "0";
  const mStr = clean.length > 2 ? clean.slice(-4, -2) : "0";
  const hStr = clean.length > 4 ? clean.slice(0, -4) : "";

  const s = parseInt(sStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const h = hStr ? parseInt(hStr, 10) || 0 : 0;

  if (h > 0) {
    return `${h}:${pad2(m)}:${pad2(s)}`;
  }
  return `${m}:${pad2(s)}`;
};

// -----------------------------------
// raw digits -> seconds
// -----------------------------------
const digitsToSeconds = (
  digits: string,
  enableMilliseconds: boolean
): number => {
  const clean = digits.replace(/\D/g, "");
  if (!clean) return 0;

  if (enableMilliseconds) {
    const cStr = clean.slice(-2) || "0";
    const sStr = clean.length > 2 ? clean.slice(-4, -2) : "0";
    const mStr = clean.length > 4 ? clean.slice(-6, -4) : "0";
    const hStr = clean.length > 6 ? clean.slice(0, -6) : "";

    const c = parseInt(cStr, 10) || 0;
    const s = parseInt(sStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    const h = hStr ? parseInt(hStr, 10) || 0 : 0;

    return h * 3600 + m * 60 + s + c / 100;
  }

  // seconds-only
  const sStr = clean.slice(-2) || "0";
  const mStr = clean.length > 2 ? clean.slice(-4, -2) : "0";
  const hStr = clean.length > 4 ? clean.slice(0, -4) : "";

  const s = parseInt(sStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const h = hStr ? parseInt(hStr, 10) || 0 : 0;

  return h * 3600 + m * 60 + s;
};

/**
 * Calculator-style duration input.
 *
 * While focused:
 *   - 1–2 digits: show raw ("5", "50")
 *   - 3+ digits: show formatted ("5:00", "5.00", "1:02.50", etc.)
 *
 * On blur:
 *   - compute seconds and call onChangeValue once
 *   - always show formatted.
 */
export default function DurationInput({
  value,
  onChangeValue,
  style,
  onChangeFocus,
  enableMilliseconds = true,
  autoFocus = false,
}: DurationInputProps) {
  const [rawDigits, setRawDigits] = useState<string>("");
  const [isFocused, setIsFocused] = useState(false);
  const [initiatedFocus, setInitiatedFocus] = useState(false);

  // Focus callbacks
  useEffect(() => {
    if (!initiatedFocus) {
      setInitiatedFocus(true);
      return;
    }
    onChangeFocus?.(isFocused);
  }, [isFocused, onChangeFocus]);
  // Sync external value -> rawDigits ONLY when we truly lose focus
  useEffect(() => {
    if (isFocused) return; // <- BLOCK SYNC 100% WHILE FOCUSED

    // If value is zero or invalid, we leave rawDigits alone
    if (!Number.isFinite(value) || value <= 0) {
      return; // <- DO NOT setRawDigits("") here; user may have cleared it
    }

    const digits = formatDurationValueToDigitString(value, enableMilliseconds);

    // Only update if different AND not focused
    setRawDigits(prev => {
      return prev === digits ? prev : digits;
    });
  }, [value, isFocused, enableMilliseconds]);

  // Typing handler – local only, no parent calls
  const handleTextChange = (text: string) => {
    const numericOnly = text.replace(/[^0-9]/g, "");
    const maxDigits = enableMilliseconds ? 8 : 6; // HHMMSSCC or HHMMSS
    const limited = numericOnly.slice(0, maxDigits);
    const cleaned = limited.replace(/^0+/, "") || "";

    setRawDigits(cleaned);
  };

  // What to show in the input?
  const formatted = useMemo(
    () => formatDigitsToTime(rawDigits, enableMilliseconds),
    [rawDigits, enableMilliseconds]
  );

  const displayValue =
    isFocused && rawDigits.length > 0 && rawDigits.length <= 2
      ? rawDigits // "5", "50"
      : formatted;

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);

    // On blur: commit to parent once
    const seconds = digitsToSeconds(rawDigits, enableMilliseconds);
    onChangeValue(seconds);
  };

  return (
    <TextInput
      keyboardType={Platform.select({
        ios: "number-pad",
        android: "number-pad",
      })}
      returnKeyType="done"
      submitBehavior="blurAndSubmit"
      style={[styles.input, isFocused && styles.inputFocused, style]}
      value={displayValue}
      onChangeText={handleTextChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      maxLength={enableMilliseconds ? 12 : 10}
      placeholder={enableMilliseconds ? "0:00.00" : "0:00"}
      placeholderTextColor="#999"
      selectTextOnFocus
      autoFocus={autoFocus}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: "#F5F5F7",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#D1D1D6",
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    textAlign: "center",
    minWidth: 80,
  },
  inputFocused: {
    borderColor: "#007AFF",
    borderWidth: 2,
  },
});
