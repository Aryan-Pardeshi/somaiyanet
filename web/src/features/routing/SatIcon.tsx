import type { SVGProps } from "react";

interface SatIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Minimal satellite marker: a solid dot (r 3-4 in route diagrams),
 * white by default. Kept as an SVG so existing `size` / `color` call
 * sites keep working. No rings, halos or glows.
 */
export function SatIcon({
  size = 28,
  color = "#ffffff",
  className = "",
  ...rest
}: SatIconProps) {
  const r = 3.5;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      {...rest}
    >
      <circle cx="6" cy="6" r={r} fill={color} />
    </svg>
  );
}
