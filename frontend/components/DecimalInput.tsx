import React, { useState, useEffect } from 'react';
import { TextInput, StyleSheet, ViewStyle } from 'react-native';

interface DecimalInputProps {
  value: number;
  onChangeValue: (value: number) => void;
  style?: ViewStyle;
  placeholder?: string;
}

/**
 * A TextInput component that properly handles decimal number input
 * Preserves the decimal point while typing and only converts to number on blur
 */
export default function DecimalInput({ value, onChangeValue, style, placeholder = '0' }: DecimalInputProps) {
  const [textValue, setTextValue] = useState(value.toString());
  const [isFocused, setIsFocused] = useState(false);

  // Sync from parent value when not focused
  useEffect(() => {
    if (!isFocused) {
      setTextValue(value === 0 ? '' : value.toString());
    }
  }, [value, isFocused]);

  const handleChangeText = (text: string) => {
    // Allow empty, digits, and one decimal point
    let cleaned = text.replace(/[^0-9.]/g, '');
    
    // Only allow one decimal point
    const dotIndex = cleaned.indexOf('.');
    if (dotIndex !== -1) {
      cleaned = cleaned.substring(0, dotIndex + 1) + 
                cleaned.substring(dotIndex + 1).replace(/\./g, '');
    }
    
    setTextValue(cleaned);
    
    // Parse and send value to parent
    const numValue = cleaned === '' || cleaned === '.' ? 0 : parseFloat(cleaned);
    onChangeValue(isNaN(numValue) ? 0 : numValue);
  };

  const handleFocus = () => {
    setIsFocused(true);
    // Show empty field if value is 0
    if (value === 0) {
      setTextValue('');
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Format the value on blur
    const numValue = textValue === '' || textValue === '.' ? 0 : parseFloat(textValue);
    const finalValue = isNaN(numValue) ? 0 : numValue;
    setTextValue(finalValue === 0 ? '' : finalValue.toString());
    onChangeValue(finalValue);
  };

  return (
    <TextInput
      style={[styles.input, style]}
      value={textValue}
      onChangeText={handleChangeText}
      onFocus={handleFocus}
      onBlur={handleBlur}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      placeholderTextColor="#999"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
});
