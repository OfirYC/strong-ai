import React, { useState, useEffect } from 'react';
import {
  TextInput,
  StyleSheet,
} from 'react-native';

interface DurationInputProps {
  value: number; // value in seconds (can be decimal, e.g. 1.50 = 1 second 50 centiseconds)
  onChangeValue: (seconds: number) => void;
  style?: object;
}

/**
 * Calculator-style duration input with centisecond support
 * As you type digits, they fill from right to left like a stopwatch
 * 
 * Format: MM:SS.cc or H:MM:SS.cc
 * The last 2 digits are always centiseconds
 * 
 * Examples:
 * - Type "1" → displays "0:00.01" (0.01 seconds)
 * - Type "50" → displays "0:00.50" (0.50 seconds)
 * - Type "150" → displays "0:01.50" (1.50 seconds)
 * - Type "3000" → displays "0:30.00" (30 seconds)
 * - Type "10000" → displays "1:00.00" (1 minute)
 */
export default function DurationInput({ value, onChangeValue, style }: DurationInputProps) {
  // Store the raw digits entered by user
  const [rawDigits, setRawDigits] = useState<string>('');
  const [isFocused, setIsFocused] = useState(false);

  // Initialize rawDigits from value prop when component mounts or value changes externally
  useEffect(() => {
    if (!isFocused && value > 0) {
      // Convert seconds (with decimals) to raw digit string
      const totalCentiseconds = Math.round(value * 100);
      const hours = Math.floor(totalCentiseconds / 360000);
      const minutes = Math.floor((totalCentiseconds % 360000) / 6000);
      const seconds = Math.floor((totalCentiseconds % 6000) / 100);
      const centis = totalCentiseconds % 100;
      
      // Build digit string (remove leading zeros but keep structure)
      let digits = '';
      if (hours > 0) {
        digits = `${hours}${minutes.toString().padStart(2, '0')}${seconds.toString().padStart(2, '0')}${centis.toString().padStart(2, '0')}`;
      } else if (minutes > 0) {
        digits = `${minutes}${seconds.toString().padStart(2, '0')}${centis.toString().padStart(2, '0')}`;
      } else if (seconds > 0) {
        digits = `${seconds}${centis.toString().padStart(2, '0')}`;
      } else if (centis > 0) {
        digits = centis.toString();
      }
      setRawDigits(digits);
    } else if (!isFocused && value === 0) {
      setRawDigits('');
    }
  }, [value, isFocused]);

  // Convert raw digits to formatted time string (MM:SS.cc or H:MM:SS.cc)
  const formatDigitsToTime = (digits: string): string => {
    if (!digits || digits === '0') return '0:00.00';
    
    // Pad to at least 6 digits for proper formatting (MMSSCC)
    const padded = digits.padStart(6, '0');
    const len = padded.length;
    
    // Extract from right to left: centiseconds, seconds, minutes, hours
    const centis = parseInt(padded.slice(-2), 10);
    const secs = parseInt(padded.slice(-4, -2), 10);
    const mins = parseInt(padded.slice(-6, -4), 10);
    const hrs = len > 6 ? parseInt(padded.slice(0, -6), 10) : 0;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
    } else {
      return `${mins}:${secs.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
    }
  };

  // Convert raw digits to total seconds (with decimal for centiseconds)
  const digitsToSeconds = (digits: string): number => {
    if (!digits) return 0;
    
    const padded = digits.padStart(6, '0');
    const len = padded.length;
    
    const centis = parseInt(padded.slice(-2), 10);
    const secs = parseInt(padded.slice(-4, -2), 10);
    const mins = parseInt(padded.slice(-6, -4), 10);
    const hrs = len > 6 ? parseInt(padded.slice(0, -6), 10) : 0;
    
    return hrs * 3600 + mins * 60 + secs + (centis / 100);
  };

  const handleTextChange = (text: string) => {
    // Only allow numeric input - strip any non-digits
    const numericOnly = text.replace(/[^0-9]/g, '');
    
    // Limit to 8 digits (max 99:59:59.99)
    const limitedDigits = numericOnly.slice(0, 8);
    
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
    <TextInput
      style={[
        styles.input,
        isFocused && styles.inputFocused,
        style
      ]}
      value={displayValue}
      onChangeText={handleTextChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      keyboardType="number-pad"
      maxLength={12}
      placeholder="0:00.00"
      placeholderTextColor="#999"
      selectTextOnFocus={true}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#D1D1D6',
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'center',
    minWidth: 80,
  },
  inputFocused: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
});
