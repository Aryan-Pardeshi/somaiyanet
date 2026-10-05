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

  return (
    <div
      className={`liquid-glass relative rounded-[20px] transition-all duration-200 ${
        noPadding ? "" : "p-4"
      } ${className}`}
      data-tone={tone}
      data-selected={selected || undefined}
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
      className={`rounded-full px-3.5 py-1.5 text-[11px] font-mono tracking-wider transition-all duration-200 cursor-pointer ${
        active
          ? "liquid-glass-active font-semibold"
          : "liquid-glass text-[#8b96b0] hover:text-[#dfe6f5]"
      } ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </button>
  );
}
