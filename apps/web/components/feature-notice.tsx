import Link from "next/link";
import type { FeatureState } from "@/lib/features";

/**
 * Explains, before the click, why a control is disabled or why its result will
 * not be kept. Renders nothing when the feature is available.
 *
 * It renders `publicMessage`, which is the only message this component can
 * reach: `FeatureState` has no operator-facing field. When the state offers a
 * way forward, the notice offers it as a real link rather than as prose about a
 * button that does not exist.
 */
export function FeatureNotice({ feature, tone = "warning" }: { feature: FeatureState; tone?: "warning" | "info" }) {
  if (feature.enabled || !feature.publicMessage) {
    return null;
  }

  return (
    <p className={tone === "info" ? "feature-notice info" : "feature-notice"} role="note">
      {feature.publicMessage}
      {feature.optionalAction ? (
        <>
          {" "}
          <Link href={feature.optionalAction.href}>{feature.optionalAction.label}</Link>
        </>
      ) : null}
    </p>
  );
}
