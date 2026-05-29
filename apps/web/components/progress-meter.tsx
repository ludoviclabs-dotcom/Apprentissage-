import type { CSSProperties } from "react";

interface ProgressMeterProps {
  value: number;
  color?: string;
  label?: string;
}

export function ProgressMeter({ value, color = "#2563eb", label }: ProgressMeterProps) {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div className="progress-meter" aria-label={label ?? `Progression ${normalized} %`}>
      <div className="progress-line">
        <span
          style={
            {
              width: `${normalized}%`,
              "--progress-color": color
            } as CSSProperties
          }
        />
      </div>
      <strong>{normalized}%</strong>
    </div>
  );
}
