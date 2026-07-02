import { Redirect } from "expo-router";

/**
 * Catch-all for any unmatched route — notably marketing / attribution deep links
 * (e.g. `stronger://open?utm_source=…`) whose path isn't a real screen. Instead of expo-router's
 * default black "Unmatched Route" screen, send the user to the app entry. The utm_* params are
 * still captured by the Linking listener in analytics/captureAttribution.
 */
export default function NotFound() {
  return <Redirect href={"/" as any} />;
}
