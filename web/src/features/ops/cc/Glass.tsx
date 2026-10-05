import React from "react";

export type GlassTone = "default" | "warn" | "critical";

export interface GlassProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: GlassTone;
  selected?: boolean;
  noPadding?: boolean;
  cut?: number; // backwards-compatibility with old Panel cut prop
}

export function Glass({
  tone = "default",
  selected = false,
  noPadding = false,
  cut,
  className = "",
  style,
  children,
  ...rest
}: GlassProps) {
  void cut;
  // Border colors per tone
  let borderColor = "rgba(255, 255, 255, 0.12)";
  let shadow =
    "inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 -1px 0 rgba(255, 255, 255, 0.04), 0 12px 40px rgba(0, 0, 0, 0.45)";
  let bgGradient =
    "linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.025))";

  if (tone === "warn") {
    borderColor = "rgba(245, 165, 36, 0.45)";
    shadow =
      "inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 -1px 0 rgba(255, 255, 255, 0.04), 0 12px 40px rgba(0, 0, 0, 0.45), 0 0 24px rgba(245, 165, 36, 0.18)";
  } else if (tone === "critical") {
    borderColor = "rgba(255, 59, 79, 0.5)";
    shadow =
      "inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 -1px 0 rgba(255, 255, 255, 0.04), 0 12px 40px rgba(0, 0, 0, 0.45), 0 0 24px rgba(255, 59, 79, 0.24)";
  }

  if (selected) {
    bgGradient =
      "linear-gradient(180deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.04))";
    borderColor = "rgba(61, 91, 255, 0.6)";
  }

  const baseStyle: React.CSSProperties = {
    backgroundColor: "rgba(10, 14, 28, 0.85)", // Fallback when backdrop-filter is unsupported
    backgroundImage: bgGradient,
    backdropFilter: "blur(22px) saturate(170%)",
    WebkitBackdropFilter: "blur(22px) saturate(170%)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor,
    boxShadow: shadow,
    ...style,
  };

  return (
    <div
      className={`relative rounded-[20px] transition-all duration-200 ${
        noPadding ? "" : "p-4"
      } ${
        selected ? "border-l-2 border-l-[#3d5bff]" : ""
      } ${className}`}
      style={baseStyle}
      {...rest}
    >
      {/* Soft specular sheen */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[20px]"
        style={{
          background:
            "radial-gradient(120% 60% at 20% 0%, rgba(255, 255, 255, 0.10), transparent 60%)",
        }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

export interface GlassPillProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: React.ReactNode;
}

export function GlassPill({
  active = false,
  className = "",
  style,
  children,
  ...rest
}: GlassPillProps) {
  const pillStyle: React.CSSProperties = active
    ? {
        backgroundColor: "rgba(61, 91, 255, 0.85)",
        borderColor: "rgba(61, 91, 255, 0.9)",
        boxShadow:
          "inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 0 12px rgba(61, 91, 255, 0.4)",
        ...style,
      }
    : {
        backgroundColor: "rgba(10, 14, 28, 0.85)",
        backgroundImage:
          "linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02))",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        borderColor: "rgba(255, 255, 255, 0.12)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.15)",
        ...style,
      };

  return (
    <button
      type="button"
      className={`rounded-full px-3.5 py-1.5 text-[11px] font-mono tracking-wider transition-all duration-200 cursor-pointer border ${
        active
          ? "text-white font-semibold"
          : "text-[#8b96b0] hover:text-[#dfe6f5] hover:bg-white/10"
      } ${className}`}
      style={pillStyle}
      {...rest}
    >
      {children}
    </button>
  );
}
