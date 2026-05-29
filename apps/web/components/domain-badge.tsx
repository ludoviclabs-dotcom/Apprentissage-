import type { CSSProperties } from "react";
import { getDomain, type DomainId } from "@finance/domain";

export function DomainBadge({ domainId }: { domainId: DomainId }) {
  const domain = getDomain(domainId);

  return (
    <span
      className="domain-badge"
      style={
        {
          "--domain-color": domain.accent,
          "--domain-bg": domain.softAccent
        } as CSSProperties
      }
    >
      {domain.shortName}
    </span>
  );
}
