import React from 'react';
import { View, StyleSheet, Text, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

interface SwipeToDeleteRowProps {
  children: React.ReactNode;
  onDelete: () => void;
}

export default function SwipeToDeleteRow({ children, onDelete }: SwipeToDeleteRowProps) {
  let swipeableRef: Swipeable | null = null;

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, -50, 0],
      outputRange: [1.2, 1, 0.8],
      extrapolate: 'clamp',
    });

    const opacity = dragX.interpolate({
      inputRange: [-100, -50, 0],
      outputRange: [1, 0.8, 0],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.deleteContainer}>
        <Animated.View style={[styles.deleteContent, { transform: [{ scale }] }]}>
          <Ionicons name="trash" size={22} color="white" />
          <Animated.Text style={[styles.deleteText, { opacity }]}>
            Delete
          </Animated.Text>
        </Animated.View>
      </View>
    );
  };

  const handleSwipeOpen = (direction: 'left' | 'right') => {
    if (direction === 'right') {
      onDelete();
      swipeableRef?.close();
    }
  };

  return (
    <Swipeable
      ref={(ref) => (swipeableRef = ref)}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeOpen}
      rightThreshold={80}
      overshootRight={false}
      friction={2}
      containerStyle={styles.swipeContainer}
    >
      <View style={styles.content}>
        {children}
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  deleteContainer: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    width: 100,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  deleteContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 6,
  },
  content: {
    borderRadius: 8,
  },
});
