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
  const rowWidth = useRef(SCREEN_WIDTH - 40); // Default, will be updated on layout
  const deleteTriggered = useRef(false);

  const handleLayout = (event: LayoutChangeEvent) => {
    rowWidth.current = event.nativeEvent.layout.width;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes (left)
        return gestureState.dx < -10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        deleteTriggered.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow left swipe (negative dx)
        if (gestureState.dx < 0) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const midpoint = -rowWidth.current / 2;
        
        if (gestureState.dx < midpoint) {
          // Past midpoint - animate to full delete and trigger
          deleteTriggered.current = true;
          Animated.timing(translateX, {
            toValue: -rowWidth.current,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onDelete();
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

  // Calculate the delete background width based on swipe distance
  const deleteWidth = translateX.interpolate({
    inputRange: [-rowWidth.current, 0],
    outputRange: [rowWidth.current, 50],
    extrapolate: 'clamp',
  });

  // Scale up the trash icon when past midpoint
  const iconScale = translateX.interpolate({
    inputRange: [-rowWidth.current, -rowWidth.current / 2, 0],
    outputRange: [1.2, 1, 1],
    extrapolate: 'clamp',
  });

  // Change opacity for "confirmed delete" state
  const confirmOpacity = translateX.interpolate({
    inputRange: [-rowWidth.current, -rowWidth.current / 2, -rowWidth.current / 2 + 1, 0],
    outputRange: [1, 1, 0, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Delete background */}
      <Animated.View 
        style={[
          styles.deleteBackground,
          {
            width: deleteWidth,
          }
        ]}
      >
        <Animated.View style={[styles.iconContainer, { transform: [{ scale: iconScale }] }]}>
          <Ionicons name="trash" size={20} color="#FFFFFF" />
        </Animated.View>
        <Animated.View style={[styles.confirmText, { opacity: confirmOpacity }]}>
          <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={styles.checkIcon} />
        </Animated.View>
      </Animated.View>

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
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    marginLeft: 8,
  },
  checkIcon: {
    opacity: 0.8,
  },
  content: {
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
  },
});
