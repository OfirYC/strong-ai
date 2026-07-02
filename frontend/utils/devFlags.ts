/**
 * Dev-only purchase shortcuts. ONE switch.
 *
 * MOCK_PURCHASES = true  → paywall uses fake packages, "buy" just advances, and the in-app
 *   Pro gate is bypassed. For fast UI iteration with no Apple ID / StoreKit. NEVER ships (it's
 *   gated behind __DEV__, so release builds always run the real flow regardless of this value).
 *
 * MOCK_PURCHASES = false → the REAL StoreKit path runs even in a dev build: real
 *   Purchases.purchasePackage(), real RevenueCat entitlement, real Pro gate. Flip this to test
 *   actual purchases against a StoreKit config file or a Sandbox tester on a device BEFORE
 *   shipping — no App Store review needed.
 */
export const MOCK_PURCHASES = __DEV__ && false;
