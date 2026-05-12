import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type PurchasesPackage, PACKAGE_TYPE } from "react-native-purchases";
import {
  fetchPackages,
  purchasePackage,
  restorePurchases,
} from "../utils/purchases";
import { useAuthStore } from "../store/authStore";

const FEATURES = [
  { icon: "sparkles", text: "Unlimited AI coach" },
  { icon: "brain", text: "Smart memory across sessions" },
  { icon: "calendar", text: "Training schedule & planning" },
  { icon: "trending-up", text: "Progress tracking & PRs" },
];

function getTrialLabel(pkg: PurchasesPackage): string | null {
  const intro = pkg.product.introductoryPrice;
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits;
  const unit = intro.periodUnit.toLowerCase();
  return `${n}-${unit} free trial`;
}

function getPeriodLabel(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case PACKAGE_TYPE.ANNUAL:
      return "/year";
    case PACKAGE_TYPE.SIX_MONTH:
      return "/6 months";
    case PACKAGE_TYPE.THREE_MONTH:
      return "/3 months";
    case PACKAGE_TYPE.TWO_MONTH:
      return "/2 months";
    case PACKAGE_TYPE.MONTHLY:
      return "/month";
    case PACKAGE_TYPE.WEEKLY:
      return "/week";
    default:
      return "";
  }
}

function getSavingsLabel(
  annual: PurchasesPackage,
  monthly: PurchasesPackage,
): string | null {
  const annualMonthly = annual.product.price / 12;
  const monthly_ = monthly.product.price;
  if (monthly_ <= 0) return null;
  const pct = Math.round((1 - annualMonthly / monthly_) * 100);
  return pct > 0 ? `Save ${pct}%` : null;
}

export default function PaywallModal({
  visible,
  onSubscribed,
}: {
  visible: boolean;
  onSubscribed: () => void;
}) {
  const { logout } = useAuthStore();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [loadingPkgs, setLoadingPkgs] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoadingPkgs(true);
    fetchPackages()
      .then(pkgs => {
        setPackages(pkgs);
        // Default select annual if present, else first
        const annual = pkgs.find(p => p.packageType === PACKAGE_TYPE.ANNUAL);
        setSelected(annual ?? pkgs[0] ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingPkgs(false));
  }, [visible]);

  const annual = packages.find(p => p.packageType === PACKAGE_TYPE.ANNUAL);
  const monthly = packages.find(p => p.packageType === PACKAGE_TYPE.MONTHLY);
  const savings = annual && monthly ? getSavingsLabel(annual, monthly) : null;

  const trialLabel = selected ? getTrialLabel(selected) : null;

  const handlePurchase = useCallback(async () => {
    if (!selected) return;
    setPurchasing(true);
    try {
      const ok = await purchasePackage(selected);
      if (ok) onSubscribed();
    } catch (e: any) {
      if (!e?.userCancelled) {
        Alert.alert("Purchase failed", e?.message ?? "Please try again.");
      }
    } finally {
      setPurchasing(false);
    }
  }, [selected, onSubscribed]);

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    try {
      const ok = await restorePurchases();
      if (ok) {
        onSubscribed();
      } else {
        Alert.alert("No subscription found", "No active subscription to restore.");
      }
    } catch {
      Alert.alert("Error", "Failed to restore purchases.");
    } finally {
      setRestoring(false);
    }
  }, [onSubscribed]);

  const ctaLabel = trialLabel
    ? `Start ${trialLabel}`
    : selected
    ? `Subscribe ${getPeriodLabel(selected)}`
    : "Subscribe";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="sparkles" size={36} color="#007AFF" />
            </View>
            <Text style={styles.title}>Stronger Pro</Text>
            <Text style={styles.subtitle}>Your AI-powered fitness coach</Text>
          </View>

          {/* Features */}
          <View style={styles.features}>
            {FEATURES.map(f => (
              <View key={f.text} style={styles.featureRow}>
                <View style={styles.featureCheck}>
                  <Ionicons name="checkmark" size={14} color="#007AFF" />
                </View>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>

          {/* Packages */}
          {loadingPkgs ? (
            <ActivityIndicator size="large" color="#007AFF" style={{ marginVertical: 32 }} />
          ) : (
            <View style={styles.packages}>
              {annual && (
                <TouchableOpacity
                  style={[
                    styles.packageCard,
                    selected?.packageType === PACKAGE_TYPE.ANNUAL && styles.packageCardSelected,
                  ]}
                  onPress={() => setSelected(annual)}
                  activeOpacity={0.8}
                >
                  <View style={styles.packageRow}>
                    <View>
                      <Text style={styles.packageTitle}>Annual</Text>
                      {savings && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{savings}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.packageRight}>
                      <Text style={styles.packagePrice}>
                        {annual.product.priceString}
                      </Text>
                      <Text style={styles.packagePeriod}>/year</Text>
                    </View>
                  </View>
                  {getTrialLabel(annual) && (
                    <Text style={styles.trialTag}>{getTrialLabel(annual)} included</Text>
                  )}
                </TouchableOpacity>
              )}

              {monthly && (
                <TouchableOpacity
                  style={[
                    styles.packageCard,
                    selected?.packageType === PACKAGE_TYPE.MONTHLY && styles.packageCardSelected,
                  ]}
                  onPress={() => setSelected(monthly)}
                  activeOpacity={0.8}
                >
                  <View style={styles.packageRow}>
                    <Text style={styles.packageTitle}>Monthly</Text>
                    <View style={styles.packageRight}>
                      <Text style={styles.packagePrice}>
                        {monthly.product.priceString}
                      </Text>
                      <Text style={styles.packagePeriod}>/month</Text>
                    </View>
                  </View>
                  {getTrialLabel(monthly) && (
                    <Text style={styles.trialTag}>{getTrialLabel(monthly)} included</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* CTA */}
          <TouchableOpacity
            style={[styles.cta, (purchasing || !selected) && styles.ctaDisabled]}
            onPress={handlePurchase}
            disabled={purchasing || !selected}
            activeOpacity={0.85}
          >
            {purchasing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            )}
          </TouchableOpacity>

          {/* Footer links */}
          <TouchableOpacity onPress={handleRestore} disabled={restoring} style={styles.restoreBtn}>
            {restoring ? (
              <ActivityIndicator size="small" color="#8E8E93" />
            ) : (
              <Text style={styles.restoreText}>Restore Purchases</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>

          <Text style={styles.legal}>
            Subscription auto-renews unless cancelled at least 24 hours before the
            end of the current period. Manage in Settings → Apple ID → Subscriptions.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F7" },
  scroll: { padding: 24, paddingBottom: 40 },

  header: { alignItems: "center", paddingVertical: 32 },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: "700", color: "#1C1C1E", marginBottom: 6 },
  subtitle: { fontSize: 16, color: "#8E8E93", textAlign: "center" },

  features: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    gap: 14,
    marginBottom: 24,
  },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { fontSize: 15, color: "#1C1C1E", fontWeight: "500" },

  packages: { gap: 12, marginBottom: 28 },
  packageCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  packageCardSelected: { borderColor: "#007AFF" },
  packageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  packageTitle: { fontSize: 16, fontWeight: "600", color: "#1C1C1E" },
  badge: {
    backgroundColor: "#007AFF",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#FFF" },
  packageRight: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  packagePrice: { fontSize: 20, fontWeight: "700", color: "#1C1C1E" },
  packagePeriod: { fontSize: 13, color: "#8E8E93" },
  trialTag: { fontSize: 13, color: "#007AFF", marginTop: 6 },

  cta: {
    backgroundColor: "#007AFF",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { fontSize: 17, fontWeight: "700", color: "#FFF" },

  restoreBtn: { alignItems: "center", paddingVertical: 10 },
  restoreText: { fontSize: 15, color: "#007AFF" },

  logoutBtn: { alignItems: "center", paddingVertical: 10 },
  logoutText: { fontSize: 15, color: "#8E8E93" },

  legal: {
    fontSize: 11,
    color: "#C7C7CC",
    textAlign: "center",
    lineHeight: 16,
    marginTop: 16,
  },
});
