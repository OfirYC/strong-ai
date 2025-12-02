import React, { useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  LayoutChangeEvent,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SwipeToDeleteRowProps {
  children: React.ReactNode;
  onDelete: () => void;
}

export default function SwipeToDeleteRow({ children, onDelete }: SwipeToDeleteRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowWidth = useRef(300);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    rowWidth.current = e.nativeEvent.layout.width;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        // Activate on horizontal left swipe
        return gesture.dx < -5 && Math.abs(gesture.dx) > Math.abs(gesture.dy * 2);
      },
      onPanResponderGrant: () => {
        // Reset any ongoing animation
        translateX.stopAnimation();
        translateX.setOffset(0);
        translateX.setValue(0);
      },
      onPanResponderMove: (_, gesture) => {
        // Allow swiping left (negative values only)
        if (gesture.dx <= 0) {
          translateX.setValue(gesture.dx);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        translateX.flattenOffset();
        const threshold = -rowWidth.current * 0.4; // 40% of width
        
        if (gesture.dx < threshold) {
          // Swipe far enough - delete
          Animated.timing(translateX, {
            toValue: -rowWidth.current,
            duration: 150,
            useNativeDriver: true,
          }).start(() => {
            onDelete();
            translateX.setValue(0);
          });
        } else {
          // Not far enough - bounce back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 8,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        translateX.flattenOffset();
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  // Icon scale animation
  const iconScale = translateX.interpolate({
    inputRange: [-200, -100, 0],
    outputRange: [1.2, 1, 0.8],
    extrapolate: 'clamp',
  });

  // Text opacity animation
  const textOpacity = translateX.interpolate({
    inputRange: [-150, -100, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container} onLayout={onLayout}>
      {/* Red background */}
      <View style={styles.deleteBackground}>
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          <Ionicons name="trash" size={22} color="white" />
        </Animated.View>
        <Animated.Text style={[styles.deleteText, { opacity: textOpacity }]}>
          Delete
        </Animated.Text>
      </View>

      {/* Content that slides */}
      <Animated.View
        style={[styles.content, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  deleteBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FF3B30',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 16,
    borderRadius: 8,
  },
  deleteText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 8,
  },
  content: {
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
  },
});
