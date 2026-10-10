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
  void tone;

  return (
    <div
      className={`relative rounded-[16px] transition-colors duration-200 ${noPadding ? "" : "p-4"} ${className}`}
      style={{
        // Liquid-glass card: mostly clear, a faint white veil, a bright top rim, light blur.
        background: selected
          ? "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))"
          : "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025))",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(255,255,255,0.04)",
        backdropFilter: "blur(14px) saturate(170%)",
        WebkitBackdropFilter: "blur(14px) saturate(170%)",
        ...style,
      }}
      {...rest}
    >
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
  return (
    <button
      type="button"
      className={`sx-btn sx-btn--sm ${
        active ? "sx-btn--filled" : "sx-btn--quiet"
      } ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </button>
  );
}

