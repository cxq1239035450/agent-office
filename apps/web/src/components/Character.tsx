import { CHARACTER_PRESETS } from "@agent-office/shared";
import type { CSSProperties } from "react";

/** Grid atlas generated from the approved thirteen-character concept. */
export function Character({
  id = "lead",
  size = 64,
  label,
  className = "",
}: {
  id?: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  const index = Math.max(
    0,
    CHARACTER_PRESETS.findIndex((p) => p.id === id),
  );
  const style = {
    width: size,
    height: size,
    backgroundPosition: `${(index % 5) * 25}% ${Math.floor(index / 5) * 50}%`,
  } as CSSProperties;
  return (
    <span
      className={`character ${className}`}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
