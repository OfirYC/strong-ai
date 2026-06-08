import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type PurchasesPackage,
} from "react-native-purchases";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";

export const PRO_ENTITLEMENT = "pro";

let _configured = false;

export function configurePurchases() {
  if (_configured) return;
  const apiKey = Platform.OS === "android" ? ANDROID_KEY : IOS_KEY;
  if (!apiKey) {
    // Misconfigured build (env var not baked in). Don't mark configured so a
    // later launch with a correct bundle can retry; warn loudly in logs.
    console.warn(
      `[purchases] Missing RevenueCat API key for ${Platform.OS} — purchases disabled`,
    );
    return;
  }
  _configured = true;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  Purchases.configure({ apiKey });
}

export async function identifyUser(userId: string): Promise<void> {
  await Purchases.logIn(userId);
}

export async function logOutPurchases(): Promise<void> {
  await Purchases.logOut();
}

export async function checkIsPro(): Promise<boolean> {
  const info = await Purchases.getCustomerInfo();
  return info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

export async function fetchPackages(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

export async function restorePurchases(): Promise<boolean> {
  const info = await Purchases.restorePurchases();
  return info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}
