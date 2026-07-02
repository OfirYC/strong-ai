import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
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
import {
  fetchPackages,
  purchasePackage,
  restorePurchases,
} from "../../utils/purchases";
import Mascot from "../components/Mascot";
import GlowCTA from "../components/GlowCTA";
import { afterBody, genderFromSex, useOnboardingStore } from "../store";
import { MOCK_PURCHASES } from "../../utils/devFlags";
import { track } from "../../analytics";
import { ob } from "../theme";

const { width } = Dimensions.get("window");
const HB = Math.min(width * 0.6, 224);
const BG = ob.bgMid;
const BG_CLEAR = "rgba(244,248,255,0)";
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_URL = "https://strong-ai-production.up.railway.app/privacy";

// DEV ONLY: fake packages so the paywall renders without StoreKit/sandbox on device.
// Prod always uses the real RevenueCat offering. Flip MOCK_PURCHASES (utils/devFlags) to false
// to run the REAL purchase flow in a dev build (sandbox testing). Move `introPrice` between the
// two entries below to change which plan carries the trial.
const DEV_MOCK = MOCK_PURCHASES;
const MOCK_PACKAGES = [
  {
    identifier: "$rc_monthly",
    packageType: PACKAGE_TYPE.MONTHLY,
    product: {
      identifier: "com.ofirsmol.strongai.pro.monthly",
      priceString: "₪34.90",
      price: 34.9,
      // monthly = free trial (dev)
      introPrice: { price: 0, priceString: "₪0.00", periodNumberOfUnits: 1, periodUnit: "WEEK" },
    },
  },
  {
    identifier: "$rc_annual",
    packageType: PACKAGE_TYPE.ANNUAL,
    product: {
      identifier: "com.ofirsmol.strongai.pro.annual",
      priceString: "₪199.90",
      price: 199.9,
      introPrice: null,
    },
  },
] as unknown as PurchasesPackage[];

const TIMELINE: { icon: any; title: string; text: string }[] = [
  { icon: "lock-open", title: "Today", text: "Your full plan & AI coach unlock instantly" },
  { icon: "notifications", title: "Day 5", text: "We'll remind you before your trial ends" },
  { icon: "star", title: "Day 7", text: "Subscription begins — cancel anytime before" },
];
// Shown when the selected plan has NO free trial (e.g. Monthly) — the value props instead.
const UNLOCKS: { icon: any; text: string }[] = [
  { icon: "lock-open", text: "Your full personalized plan, unlocked" },
  { icon: "sparkles", text: "AI coach that adapts your plan every week" },
  { icon: "shield-checkmark", text: "Diagnoses & fixes aches before they stop you" },
  { icon: "trending-up", text: "Progress, PRs & milestones tracked" },
];

function trialText(pkg?: PurchasesPackage | null): string | null {
  const intro = pkg?.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  return `${intro.periodNumberOfUnits}-${intro.periodUnit.toLowerCase()} free trial`;
}
function shortPeriod(pkg: PurchasesPackage): string {
  return pkg.packageType === PACKAGE_TYPE.ANNUAL ? "yr" : pkg.packageType === PACKAGE_TYPE.MONTHLY ? "mo" : "";
}
function savingsPct(annual?: PurchasesPackage, monthly?: PurchasesPackage): string | null {
  if (!annual || !monthly || monthly.product.price <= 0) return null;
  const pct = Math.round((1 - annual.product.price / 12 / monthly.product.price) * 100);
  return pct > 0 ? `SAVE ${pct}%` : null;
}

export default function PaywallScreen({
  onSubscribed,
  onMaybeLater,
}: {
  onSubscribed: () => void;
  /** Optional — when omitted (e.g. the in-app hard gate), the "Not now" dismiss is hidden. */
  onMaybeLater?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { answers } = useOnboardingStore();
  const gender = genderFromSex(answers.sex);
  const goalBody = afterBody(gender, answers.goal);

  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    if (DEV_MOCK) {
      setPackages(MOCK_PACKAGES);
      setSelected(
        MOCK_PACKAGES.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL) ?? MOCK_PACKAGES[0],
      );
      setLoading(false);
      return;
    }
    fetchPackages()
      .then((pkgs) => {
        setPackages(pkgs);
        const annual = pkgs.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL);
        setSelected(annual ?? pkgs[0] ?? null);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    track("paywall_viewed", { is_gate: !onMaybeLater });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const annual = packages.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL);
  const monthly = packages.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY);
  const save = savingsPct(annual, monthly);

  const buy = useCallback(async () => {
    if (!selected) return;
    track("checkout_started", { plan: selected.packageType, mock: DEV_MOCK });
    if (DEV_MOCK) {
      track("purchase_completed", { plan: selected.packageType, mock: true });
      onSubscribed(); // no real StoreKit in dev — just advance the flow
      return;
    }
    setPurchasing(true);
    try {
      const ok = await purchasePackage(selected);
      if (ok) {
        track("purchase_completed", {
          plan: selected.packageType,
          product: selected.product.identifier,
          price: selected.product.price,
        });
        onSubscribed();
      }
    } catch (e: any) {
      if (!e?.userCancelled) Alert.alert("Purchase failed", e?.message ?? "Please try again.");
    } finally {
      setPurchasing(false);
    }
  }, [selected, onSubscribed]);

  const restore = useCallback(async () => {
    setRestoring(true);
    try {
      const ok = await restorePurchases();
      if (ok) onSubscribed();
      else Alert.alert("Nothing to restore", "No active subscription found.");
    } catch {
      Alert.alert("Error", "Couldn't restore purchases.");
    } finally {
      setRestoring(false);
    }
  }, [onSubscribed]);

  const trial = trialText(selected);
  const ctaLabel = trial ? "Start my 7-day free trial" : "Unlock my plan";
  const note = !selected
    ? ""
    : trial
      ? `${trial}, then ${selected.product.priceString}/${shortPeriod(selected)} · cancel anytime`
      : `${selected.product.priceString}/${shortPeriod(selected)} · cancel anytime`;

  return (
    <View style={styles.root}>
      <View style={[styles.safe, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        {/* Big goal-mascot faded into the background (waist-up) */}
        <Animated.View
          entering={FadeInDown.duration(460).easing(Easing.out(Easing.cubic))}
          style={styles.mascotZone}
          pointerEvents="none"
        >
          <Mascot gender={gender} body={goalBody} state="cheer" size={HB} />
          <LinearGradient colors={[BG_CLEAR, BG]} locations={[0, 0.42]} style={[styles.fade, { height: HB * 0.6 }]} />
        </Animated.View>

        {/* Sell — trial timeline when a trial is selected, otherwise the benefits */}
        <View style={styles.content}>
          <Text style={styles.kicker}>STRONGER PRO</Text>
          <Text style={styles.title}>
            {trial ? "Start your 7-day free trial" : "Unlock Stronger Pro"}
          </Text>
          <View style={styles.tlCard}>
            {trial ? (
              TIMELINE.map((t, i) => (
                <View key={t.title} style={styles.tlRow}>
                  <View style={styles.tlLeft}>
                    <View style={[styles.tlDot, i === TIMELINE.length - 1 && styles.tlDotLast]}>
                      <Ionicons name={t.icon} size={15} color={i === TIMELINE.length - 1 ? "#fff" : ob.primaryDeep} />
                    </View>
                    {i < TIMELINE.length - 1 && <View style={styles.tlLine} />}
                  </View>
                  <View style={styles.tlBody}>
                    <Text style={styles.tlTitle}>{t.title}</Text>
                    <Text style={styles.tlText}>{t.text}</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.benefits}>
                {UNLOCKS.map((u) => (
                  <View key={u.text} style={styles.benefitRow}>
                    <View style={styles.benefitIcon}>
                      <Ionicons name={u.icon} size={15} color={ob.primaryDeep} />
                    </View>
                    <Text style={styles.benefitText}>{u.text}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Plans + CTA pinned to bottom */}
        <View style={styles.bottom}>
          {loading ? (
            <ActivityIndicator color={ob.primary} style={{ marginVertical: 20 }} />
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>Couldn't load pricing. Check your connection.</Text>
              <Pressable onPress={load} style={styles.retry}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.plans}>
              {annual && (
                <PlanCard
                  title="Annual"
                  price={`${annual.product.priceString}/yr`}
                  sub={trialText(annual) ? `7 days free, then billed yearly` : "Billed yearly"}
                  badge={save}
                  selected={selected?.packageType === PACKAGE_TYPE.ANNUAL}
                  onPress={() => setSelected(annual)}
                />
              )}
              {monthly && (
                <PlanCard
                  title="Monthly"
                  price={`${monthly.product.priceString}/mo`}
                  sub={trialText(monthly) ? `${trialText(monthly)}, then billed monthly` : "No free trial · billed monthly"}
                  selected={selected?.packageType === PACKAGE_TYPE.MONTHLY}
                  onPress={() => setSelected(monthly)}
                />
              )}
            </View>
          )}

          <GlowCTA label={ctaLabel} onPress={buy} loading={purchasing} />
          {!!note && <Text style={styles.note}>{note}</Text>}

          <View style={styles.links}>
            <Pressable onPress={restore} hitSlop={8}>
              <Text style={styles.link}>{restoring ? "Restoring…" : "Restore"}</Text>
            </Pressable>
            <Text style={styles.linkDot}>·</Text>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
              <Text style={styles.link}>Terms</Text>
            </Pressable>
            <Text style={styles.linkDot}>·</Text>
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
              <Text style={styles.link}>Privacy</Text>
            </Pressable>
            {onMaybeLater && (
              <>
                <Text style={styles.linkDot}>·</Text>
                <Pressable onPress={onMaybeLater} hitSlop={8}>
                  <Text style={styles.link}>Not now</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function PlanCard({
  title,
  price,
  sub,
  badge,
  selected,
  onPress,
}: {
  title: string;
  price: string;
  sub: string;
  badge?: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.plan, selected && styles.planSelected]}>
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.planTitle}>{title}</Text>
        <Text style={styles.planSub}>{sub}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {!!badge && (
          <View style={styles.planBadge}>
            <Text style={styles.planBadgeText}>{badge}</Text>
          </View>
        )}
        <Text style={styles.planPrice}>{price}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safe: { flex: 1, paddingHorizontal: ob.gutter },

  mascotZone: { height: HB, alignItems: "center", justifyContent: "flex-start", marginTop: 2 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0 },

  content: { alignItems: "center", marginTop: -HB * 0.32 },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.6, color: ob.primary },
  title: {
    fontSize: 25,
    fontWeight: "800",
    color: ob.ink,
    letterSpacing: -0.5,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  tlCard: {
    alignSelf: "stretch",
    backgroundColor: "#fff",
    borderRadius: ob.rLg,
    padding: 16,
    shadowColor: "#0B1524",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  tlRow: { flexDirection: "row", gap: 12 },
  tlLeft: { width: 30, alignItems: "center" },
  tlDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ob.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  tlDotLast: { backgroundColor: ob.primary },
  tlLine: { width: 2, flex: 1, backgroundColor: ob.hairline, marginTop: 2 },
  tlBody: { flex: 1, paddingBottom: 9 },
  tlTitle: { fontSize: 14.5, fontWeight: "800", color: ob.ink },
  tlText: { fontSize: 13, color: ob.textSoft, marginTop: 1, fontWeight: "500" },

  benefits: { gap: 15 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  benefitIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: ob.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: { flex: 1, fontSize: 14.5, fontWeight: "600", color: ob.text },

  bottom: { marginTop: "auto", paddingTop: 12 },
  plans: { gap: 10, marginBottom: 12 },
  plan: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: ob.rMd,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: ob.hairline,
  },
  planSelected: { borderColor: ob.primary, backgroundColor: ob.primaryTint },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#C5D2E6",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: ob.primary, backgroundColor: ob.primary },
  planTitle: { fontSize: 16, fontWeight: "800", color: ob.ink },
  planSub: { fontSize: 12.5, color: ob.textSoft, marginTop: 2, fontWeight: "500" },
  planBadge: { backgroundColor: ob.primary, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 4 },
  planBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 0.4 },
  planPrice: { fontSize: 14.5, fontWeight: "800", color: ob.ink },

  note: { fontSize: 12.5, color: ob.textSoft, textAlign: "center", marginTop: 10, fontWeight: "600" },

  errorBox: { alignItems: "center", gap: 10, marginVertical: 6 },
  errorText: { fontSize: 13.5, color: ob.textSoft, textAlign: "center" },
  retry: { paddingVertical: 8, paddingHorizontal: 18, backgroundColor: ob.primaryTint, borderRadius: 10 },
  retryText: { fontSize: 14, color: ob.primaryDeep, fontWeight: "700" },

  links: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 12 },
  link: { fontSize: 12, color: ob.textFaint, fontWeight: "600" },
  linkDot: { fontSize: 12, color: ob.textFaint },
});
