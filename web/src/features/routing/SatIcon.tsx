import type { SVGProps } from "react";

interface SatIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
}

export function SatIcon({
  size = 56,
  color = "currentColor",
  className = "",
  ...rest
}: SatIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      {...rest}
    >
      {/* Dish antenna atop the bus */}
      <path
        d="M23 15C25.5 17.5 30.5 17.5 33 15"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <line
        x1="28"
        y1="16.5"
        x2="28"
        y2="22"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <line
        x1="28"
        y1="16.5"
        x2="28"
        y2="13.5"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="28" cy="13" r="0.9" fill={color} />

      {/* Central satellite bus (square) */}
      <rect
        x="22"
        y="22"
        width="12"
        height="12"
        rx="1"
        stroke={color}
        strokeWidth="1.4"
        fill="rgba(255, 255, 255, 0.04)"
      />
      {/* Central sensor core */}
      <circle cx="28" cy="28" r="1.8" fill={color} fillOpacity="0.8" />
      <circle
        cx="28"
        cy="28"
        r="3.5"
        stroke={color}
        strokeWidth="0.8"
        strokeDasharray="1.5 1.5"
      />

      {/* Left solar wing boom */}
      <line
        x1="18"
        y1="28"
        x2="22"
        y2="28"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Left solar wing */}
      <rect
        x="4"
        y="21"
        width="14"
        height="14"
        rx="0.5"
        stroke={color}
        strokeWidth="1.2"
        fill="rgba(61, 91, 255, 0.08)"
      />
      {/* Left solar wing cell grid */}
      <line
        x1="4"
        y1="28"
        x2="18"
        y2="28"
        stroke={color}
        strokeWidth="0.9"
        strokeOpacity="0.6"
      />
      <line
        x1="8.6"
        y1="21"
        x2="8.6"
        y2="35"
        stroke={color}
        strokeWidth="0.9"
        strokeOpacity="0.6"
      />
      <line
        x1="13.3"
        y1="21"
        x2="13.3"
        y2="35"
        stroke={color}
        strokeWidth="0.9"
        strokeOpacity="0.6"
      />

      {/* Right solar wing boom */}
      <line
        x1="34"
        y1="28"
        x2="38"
        y2="28"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Right solar wing */}
      <rect
        x="38"
        y="21"
        width="14"
        height="14"
        rx="0.5"
        stroke={color}
        strokeWidth="1.2"
        fill="rgba(61, 91, 255, 0.08)"
      />
      {/* Right solar wing cell grid */}
      <line
        x1="38"
        y1="28"
        x2="52"
        y2="28"
        stroke={color}
        strokeWidth="0.9"
        strokeOpacity="0.6"
      />
      <line
        x1="42.6"
        y1="21"
        x2="42.6"
        y2="35"
        stroke={color}
        strokeWidth="0.9"
        strokeOpacity="0.6"
      />
      <line
        x1="47.3"
        y1="21"
        x2="47.3"
        y2="35"
        stroke={color}
        strokeWidth="0.9"
        strokeOpacity="0.6"
      />

      {/* Bottom thruster nozzles */}
      <line
        x1="25.5"
        y1="34"
        x2="24.5"
        y2="37"
        stroke={color}
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <line
        x1="30.5"
        y1="34"
        x2="31.5"
        y2="37"
        stroke={color}
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
