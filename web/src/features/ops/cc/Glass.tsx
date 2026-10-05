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
      className={`sx-material relative rounded-[16px] transition-colors duration-200 ${
        selected ? "bg-[var(--sx-surface-2)]" : ""
      } ${noPadding ? "" : "p-4"} ${className}`}
      style={style}
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

