import React, { useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface SwipeToDeleteRowProps {
  children: React.ReactNode;
  onDelete: () => void;
}

/**
 * Swipe-to-delete row component with smooth animation
 * - Shows trash icon on swipe
 * - Expands to fill row when past midpoint
 * - Deletes on release if past midpoint
 * - Cancels if released before midpoint
 */
export default function SwipeToDeleteRow({ children, onDelete }: SwipeToDeleteRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowWidthRef = useRef(SCREEN_WIDTH - 40);
  const onDeleteRef = useRef(onDelete);
  
  // Keep onDelete ref updated
  onDeleteRef.current = onDelete;

  const handleLayout = (event: LayoutChangeEvent) => {
    rowWidthRef.current = event.nativeEvent.layout.width;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes (left)
        return gestureState.dx < -10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow left swipe (negative dx), clamp to row width
        if (gestureState.dx < 0) {
          const clampedX = Math.max(gestureState.dx, -rowWidthRef.current);
          translateX.setValue(clampedX);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const rowWidth = rowWidthRef.current;
        const midpoint = -rowWidth / 2;
        
        if (gestureState.dx < midpoint) {
          // Past midpoint - animate to full delete and trigger
          Animated.timing(translateX, {
            toValue: -rowWidth,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onDeleteRef.current();
            // Reset position after delete
            translateX.setValue(0);
          });
        } else {
          // Before midpoint - snap back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        // Snap back if gesture is terminated
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  // Scale up the trash icon when past midpoint
  const iconScale = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, -SCREEN_WIDTH / 4, 0],
    outputRange: [1.3, 1, 1],
    extrapolate: 'clamp',
  });

  // Fade in "Delete" text when past midpoint
  const textOpacity = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, -SCREEN_WIDTH / 4, -SCREEN_WIDTH / 4 + 20, 0],
    outputRange: [1, 1, 0, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Delete background - full width, always visible behind */}
      <View style={styles.deleteBackground}>
        <Animated.View style={[styles.iconContainer, { transform: [{ scale: iconScale }] }]}>
          <Ionicons name="trash" size={22} color="#FFFFFF" />
        </Animated.View>
        <Animated.Text style={[styles.deleteText, { opacity: textOpacity }]}>
          Delete
        </Animated.Text>
      </View>

      {/* Swipeable content */}
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: 8,
    overflow: 'hidden',
    borderRadius: 8,
  },
  deleteBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 20,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  content: {
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
  },
});
