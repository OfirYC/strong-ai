import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Edge } from 'react-native-safe-area-context';

interface ScreenWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: Edge[];
  backgroundColor?: string;
  noPadding?: boolean;
}

/**
 * Global screen wrapper component that provides consistent padding
 * and safe area handling across all screens.
 */
export default function ScreenWrapper({
  children,
  style,
  edges = ['top', 'bottom'],
  backgroundColor = '#F5F5F7',
  noPadding = false,
}: ScreenWrapperProps) {
  return (
    <SafeAreaView 
      style={[styles.safeArea, { backgroundColor }]} 
      edges={edges}
    >
      <View style={[
        styles.container, 
        noPadding ? null : styles.padding,
        style
      ]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  padding: {
    paddingHorizontal: 16,
  },
});
