import type { FeatureState } from "@/lib/features";

/**
 * Explains, before the click, why a control is disabled or why its result will
 * not be kept. Renders nothing when the feature is available.
 */
export function FeatureNotice({ feature, tone = "warning" }: { feature: FeatureState; tone?: "warning" | "info" }) {
  if (feature.enabled || !feature.reason) {
    return null;
  }

  return (
    <p className={tone === "info" ? "feature-notice info" : "feature-notice"} role="note">
      {feature.reason}
    </p>
  );
}
