import React from "react";

interface SatIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
}

export function SatIcon({
  size = 44,
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
      {/* Antenna */}
      <path
        d="M23 15C25.5 17.5 30.5 17.5 33 15"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="28"
        y1="16.5"
        x2="28"
        y2="22"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Central satellite bus (square) */}
      <rect
        x="22"
        y="22"
        width="12"
        height="12"
        rx="1"
        stroke={color}
        strokeWidth="1.5"
      />

      {/* Left solar wing boom */}
      <line
        x1="18"
        y1="28"
        x2="22"
        y2="28"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Left solar wing */}
      <rect
        x="4"
        y="21"
        width="14"
        height="14"
        rx="1"
        stroke={color}
        strokeWidth="1.5"
      />
      <line
        x1="4"
        y1="28"
        x2="18"
        y2="28"
        stroke={color}
        strokeWidth="1.5"
      />
      <line
        x1="11"
        y1="21"
        x2="11"
        y2="35"
        stroke={color}
        strokeWidth="1.5"
      />

      {/* Right solar wing boom */}
      <line
        x1="34"
        y1="28"
        x2="38"
        y2="28"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Right solar wing */}
      <rect
        x="38"
        y="21"
        width="14"
        height="14"
        rx="1"
        stroke={color}
        strokeWidth="1.5"
      />
      <line
        x1="38"
        y1="28"
        x2="52"
        y2="28"
        stroke={color}
        strokeWidth="1.5"
      />
      <line
        x1="45"
        y1="21"
        x2="45"
        y2="35"
        stroke={color}
        strokeWidth="1.5"
      />

      {/* Bottom thruster nozzles */}
      <line
        x1="25.5"
        y1="34"
        x2="24.5"
        y2="38"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="30.5"
        y1="34"
        x2="31.5"
        y2="38"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

