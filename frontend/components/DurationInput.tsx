import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';

interface DurationInputProps {
  value: number; // value in seconds
  onChangeValue: (seconds: number) => void;
  style?: object;
}

/**
 * Calculator-style duration input
 * As you type digits, they fill from right to left like a clock
 * 
 * Examples:
 * - Type "3" → displays "0:03" (3 seconds)
 * - Type "30" → displays "0:30" (30 seconds)
 * - Type "300" → displays "3:00" (3 minutes)
 * - Type "3000" → displays "30:00" (30 minutes)
 * - Type "30000" → displays "5:00:00" (5 hours)
 */
export default function DurationInput({ value, onChangeValue, style }: DurationInputProps) {
  // Store the raw digits entered by user
  const [rawDigits, setRawDigits] = useState<string>('');
  const [isFocused, setIsFocused] = useState(false);

  // Initialize rawDigits from value prop when component mounts or value changes externally
  useEffect(() => {
    if (!isFocused && value > 0) {
      // Convert seconds to raw digit string
      const totalSeconds = Math.floor(value);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      
      // Build digit string (remove leading zeros)
      let digits = '';
      if (hours > 0) {
        digits = `${hours}${minutes.toString().padStart(2, '0')}${seconds.toString().padStart(2, '0')}`;
      } else if (minutes > 0) {
        digits = `${minutes}${seconds.toString().padStart(2, '0')}`;
      } else if (seconds > 0) {
        digits = seconds.toString();
      }
      setRawDigits(digits);
    } else if (!isFocused && value === 0) {
      setRawDigits('');
    }
  }, [value, isFocused]);

  // Convert raw digits to formatted time string (MM:SS or H:MM:SS)
  const formatDigitsToTime = (digits: string): string => {
    if (!digits || digits === '0') return '0:00';
    
    // Pad to at least 4 digits for proper formatting
    const padded = digits.padStart(4, '0');
    const len = padded.length;
    
    // Extract hours, minutes, seconds from right to left
    const secs = parseInt(padded.slice(-2), 10);
    const mins = parseInt(padded.slice(-4, -2), 10);
    const hrs = len > 4 ? parseInt(padded.slice(0, -4), 10) : 0;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  };

  // Convert raw digits to total seconds
  const digitsToSeconds = (digits: string): number => {
    if (!digits) return 0;
    
    const padded = digits.padStart(4, '0');
    const len = padded.length;
    
    const secs = parseInt(padded.slice(-2), 10);
    const mins = parseInt(padded.slice(-4, -2), 10);
    const hrs = len > 4 ? parseInt(padded.slice(0, -4), 10) : 0;
    
    return hrs * 3600 + mins * 60 + secs;
  };

  const handleTextChange = (text: string) => {
    // Only allow numeric input
    const numericOnly = text.replace(/[^0-9]/g, '');
    
    // Limit to 6 digits (max 99:59:59)
    const limitedDigits = numericOnly.slice(0, 6);
    
    // Remove leading zeros for storage
    const cleanedDigits = limitedDigits.replace(/^0+/, '') || '';
    
    setRawDigits(cleanedDigits);
    
    // Convert to seconds and notify parent
    const seconds = digitsToSeconds(cleanedDigits);
    onChangeValue(seconds);
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const displayValue = formatDigitsToTime(rawDigits);

  return (
    <View style={[styles.container, style]}>
      <TextInput
        style={styles.hiddenInput}
        value={rawDigits}
        onChangeText={handleTextChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        keyboardType="number-pad"
        maxLength={6}
        caretHidden={true}
      />
      <TouchableOpacity 
        style={[
          styles.displayContainer,
          isFocused && styles.displayContainerFocused
        ]}
        activeOpacity={1}
      >
        <Text style={styles.displayText}>{displayValue}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    width: '100%',
    height: '100%',
  },
  displayContainer: {
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#D1D1D6',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  displayContainerFocused: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  displayText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'center',
  },
});
