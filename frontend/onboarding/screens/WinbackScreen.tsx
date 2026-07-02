import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, Easing } from "react-native-reanimated";
import { type PurchasesPackage, PACKAGE_TYPE } from "react-native-purchases";
import { fetchPackages, purchasePackage } from "../../utils/purchases";
import { MOCK_PURCHASES } from "../../utils/devFlags";
import { track } from "../../analytics";
import Mascot from "../components/Mascot";
import GlowCTA from "../components/GlowCTA";
import { afterBody, genderFromSex, useOnboardingStore } from "../store";
import { ob } from "../theme";

const { width } = Dimensions.get("window");
const HB = Math.min(width * 0.5, 178);
const BG = ob.bgMid;
const BG_CLEAR = "rgba(244,248,255,0)";

function trialText(pkg?: PurchasesPackage | null): string | null {
  const intro = pkg?.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  return `${intro.periodNumberOfUnits}-${intro.periodUnit.toLowerCase()} free trial`;
}
function savingsPct(
  annual?: PurchasesPackage | null,
  monthly?: PurchasesPackage | null,
): number | null {
  if (!annual || !monthly || monthly.product.price <= 0) return null;
  const pct = Math.round((1 - annual.product.price / 12 / monthly.product.price) * 100);
  return pct > 0 ? pct : null;
}

export default function WinbackScreen({
  onClaimed,
  onDecline,
}: {
  onClaimed: () => void;
  onDecline: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { answers } = useOnboardingStore();
  const gender = genderFromSex(answers.sex);
  const goalBody = afterBody(gender, answers.goal);

  const [annual, setAnnual] = useState<PurchasesPackage | null>(null);
  const [monthly, setMonthly] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(!MOCK_PURCHASES);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    track("winback_viewed");
  }, []);

  useEffect(() => {
    if (MOCK_PURCHASES) return;
    fetchPackages()
      .then((pkgs) => {
        setAnnual(pkgs.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL) ?? pkgs[0] ?? null);
        setMonthly(pkgs.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY) ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const trial = trialText(annual);
  const save = savingsPct(annual, monthly);
  const priceLine = MOCK_PURCHASES
    ? "7 days free, then billed yearly · cancel anytime"
    : annual
      ? trial
        ? `${trial}, then ${annual.product.priceString}/yr · cancel anytime`
        : `${annual.product.priceString}/yr · cancel anytime`
      : "";

  const claim = useCallback(async () => {
    track("winback_claim_started", { mock: MOCK_PURCHASES });
    if (MOCK_PURCHASES) {
      track("purchase_completed", { source: "winback", mock: true });
      return onClaimed();
    }
    if (!annual) return;
    setPurchasing(true);
    try {
      const ok = await purchasePackage(annual);
      if (ok) {
        track("purchase_completed", {
          source: "winback",
          product: annual.product.identifier,
          price: annual.product.price,
        });
        onClaimed();
      }
    } catch (e: any) {
      if (!e?.userCancelled) Alert.alert("Purchase failed", e?.message ?? "Please try again.");
    } finally {
      setPurchasing(false);
    }
  }, [annual, onClaimed]);

  return (
    <View style={styles.root}>
      <View style={[styles.safe, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 14 }]}>
        {/* Mascot */}
        <Animated.View
          entering={FadeInDown.duration(440).easing(Easing.out(Easing.cubic))}
          style={styles.mascotZone}
          pointerEvents="none"
        >
          <Mascot gender={gender} body={goalBody} state="wave" size={HB} />
          <LinearGradient colors={[BG_CLEAR, BG]} locations={[0, 0.45]} style={[styles.fade, { height: HB * 0.6 }]} />
        </Animated.View>

        <View style={styles.content}>
          <Text style={styles.kicker}>WAIT — ONE LAST THING</Text>
          <Text style={styles.title}>Don't leave your{"\n"}plan behind</Text>
          <Text style={styles.sub}>
            You just built a plan made for you. Start it with your{" "}
            <Text style={styles.bold}>7-day free trial</Text> — nothing charged today, cancel anytime.
          </Text>

          {!!save && (
            <View style={styles.badge}>
              <Ionicons name="pricetag" size={13} color="#fff" />
              <Text style={styles.badgeText}>Best value — save {save}% vs monthly</Text>
            </View>
          )}
        </View>

        {/* Bottom offer + CTA */}
        <View style={styles.bottom}>
          {loading ? (
            <ActivityIndicator color={ob.primary} style={{ marginVertical: 18 }} />
          ) : (
            <>
              <GlowCTA label="Start my 7-day free trial" onPress={claim} loading={purchasing} />
              {!!priceLine && <Text style={styles.note}>{priceLine}</Text>}
            </>
          )}
          <Pressable
            onPress={() => {
              track("winback_declined");
              onDecline();
            }}
            hitSlop={10}
            style={styles.declineBtn}
          >
            <Text style={styles.decline}>No thanks — I'll pass</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safe: { flex: 1, paddingHorizontal: ob.gutter },
  mascotZone: { height: HB, alignItems: "center", justifyContent: "flex-start", marginTop: 4 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0 },

  content: { alignItems: "center", marginTop: -HB * 0.28 },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4, color: ob.primary },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: ob.ink,
    letterSpacing: -0.5,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 33,
  },
  sub: {
    fontSize: 15,
    color: ob.textSoft,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 22,
    paddingHorizontal: 10,
    fontWeight: "500",
  },
  bold: { fontWeight: "800", color: ob.ink },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: ob.primary,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 20,
  },
  badgeText: { fontSize: 13, fontWeight: "800", color: "#fff", letterSpacing: 0.2 },

  bottom: { marginTop: "auto" },
  note: { fontSize: 12.5, color: ob.textSoft, textAlign: "center", marginTop: 10, fontWeight: "600" },
  declineBtn: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  decline: { fontSize: 14, color: ob.textFaint, fontWeight: "600" },
});
