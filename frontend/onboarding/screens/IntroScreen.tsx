import React, { useRef, useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import Backdrop from "../components/Backdrop";
import Mascot from "../components/Mascot";
import Glow from "../components/Glow";
import PrimaryButton from "../components/PrimaryButton";
import { MascotState } from "../../assets/mascot";
import { hapticSelect } from "../haptics";
import { ob } from "../theme";

const { width } = Dimensions.get("window");
const MASCOT = Math.min(width * 0.68, 290);
const AURA = MASCOT * 1.7;

type Card = { state: MascotState; title: string; body: string };
const CARDS: Card[] = [
  {
    state: "curl",
    title: "Adapts to you",
    body: "Every week your plan reweights to exactly what you actually lifted.",
  },
  {
    state: "think",
    title: "Coaching that talks back",
    body: "Ask it anything — swaps, form cues, why today is a deload.",
  },
  {
    state: "cheer",
    title: "Watch yourself get strong",
    body: "Your coach levels up right alongside you, session after session.",
  },
];

const AScrollView = Animated.createAnimatedComponent(ScrollView);

export default function IntroScreen({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip?: () => void;
}) {
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollView>(null);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const handleContinue = () => {
    if (index < CARDS.length - 1) {
      ref.current?.scrollTo({ x: (index + 1) * width, animated: true });
    } else {
      onNext();
    }
  };

  return (
    <Backdrop>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Skip */}
        <View style={styles.topbar}>
          <Pressable
            hitSlop={12}
            onPress={() => {
              hapticSelect();
              onSkip ? onSkip() : onNext();
            }}
          >
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>

        <AScrollView
          ref={ref as any}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) =>
            setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
          }
          style={styles.pager}
        >
          {CARDS.map((c, i) => (
            <IntroCard key={i} card={c} index={i} scrollX={scrollX} />
          ))}
        </AScrollView>

        {/* Dots */}
        <View style={styles.dots}>
          {CARDS.map((_, i) => (
            <Dot key={i} index={i} scrollX={scrollX} />
          ))}
        </View>

        {/* CTA */}
        <View style={styles.cta}>
          <PrimaryButton
            label={index < CARDS.length - 1 ? "Next" : "Build my plan"}
            onPress={handleContinue}
          />
        </View>
      </SafeAreaView>
    </Backdrop>
  );
}

function IntroCard({
  card,
  index,
  scrollX,
}: {
  card: Card;
  index: number;
  scrollX: SharedValue<number>;
}) {
  // Parallax + scale as the card moves through center.
  const mascotStyle = useAnimatedStyle(() => {
    const input = [
      (index - 1) * width,
      index * width,
      (index + 1) * width,
    ];
    const scale = interpolate(scrollX.value, input, [0.8, 1, 0.8], Extrapolation.CLAMP);
    const translateX = interpolate(
      scrollX.value,
      input,
      [width * 0.25, 0, -width * 0.25],
      Extrapolation.CLAMP,
    );
    return { transform: [{ translateX }, { scale }] };
  });
  const textStyle = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    const opacity = interpolate(scrollX.value, input, [0, 1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollX.value, input, [16, 0, 16], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.stage, mascotStyle]}>
        <View style={styles.auraWrap}>
          <Glow size={AURA} id={`introGlow${index}`} intensity={0.5} />
        </View>
        <Mascot gender="m" body="lean" state={card.state} size={MASCOT} />
      </Animated.View>
      <Animated.View style={[styles.copy, textStyle]}>
        <Text style={styles.title}>{card.title}</Text>
        <Text style={styles.body}>{card.body}</Text>
      </Animated.View>
    </View>
  );
}

function Dot({
  index,
  scrollX,
}: {
  index: number;
  scrollX: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    const w = interpolate(scrollX.value, input, [8, 22, 8], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, input, [0.3, 1, 0.3], Extrapolation.CLAMP);
    return { width: w, opacity };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topbar: {
    height: 44,
    paddingHorizontal: ob.gutter,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  skip: { fontSize: 16, color: ob.textSoft, fontWeight: "600" },
  pager: { flex: 1 },
  card: {
    width,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: ob.gutter + 8,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  auraWrap: { position: "absolute", alignItems: "center", justifyContent: "center" },
  copy: { alignItems: "center", paddingBottom: 8 },
  title: {
    fontSize: ob.h1,
    fontWeight: "800",
    color: ob.ink,
    letterSpacing: -0.4,
    textAlign: "center",
  },
  body: {
    fontSize: ob.body,
    lineHeight: ob.body * 1.45,
    color: ob.textSoft,
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 8,
  },
  dots: {
    flexDirection: "row",
    gap: 7,
    alignSelf: "center",
    marginBottom: 22,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: ob.primary,
  },
  cta: { paddingHorizontal: ob.gutter, paddingBottom: 8 },
});
