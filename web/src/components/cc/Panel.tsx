import React from "react";

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  cut?: number;
  borderColor?: string;
  backgroundColor?: string;
  selected?: boolean;
  glowColor?: string;
  innerClassName?: string;
}

export function Panel({
  children,
  className = "",
  innerClassName = "",
  cut = 8,
  borderColor,
  backgroundColor,
  selected = false,
  glowColor,
  onClick,
  style,
  ...rest
}: PanelProps) {
  // Apple inset-grouped surface (docs/design/DESIGN.md). `cut` and `glowColor`
  // are kept for API compatibility but no longer draw chamfers or glows.
  void cut;
  void glowColor;
  const containerStyle: React.CSSProperties = {
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(borderColor ? { boxShadow: `inset 0 0 0 1px ${borderColor}` } : {}),
    ...style,
  };

  // Panels with onClick act as buttons (fleet cards, route cards, profile
  // switcher): expose button semantics + keyboard activation so they work
  // without a mouse. Plain containers stay generic divs.
  const interactive = onClick !== undefined;
  const {
    role: restRole,
    tabIndex: restTabIndex,
    onKeyDown: restOnKeyDown,
    ...divRest
  } = rest;
  const handleKeyDown = (
    ev: React.KeyboardEvent<HTMLDivElement>,
  ): void => {
    restOnKeyDown?.(ev);
    if (ev.defaultPrevented) return;
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      onClick?.(ev as unknown as React.MouseEvent<HTMLDivElement>);
    }
  };

  return (
    <div
      style={containerStyle}
      onClick={onClick}
      role={interactive ? (restRole ?? "button") : restRole}
      tabIndex={interactive ? (restTabIndex ?? 0) : restTabIndex}
      onKeyDown={interactive ? handleKeyDown : restOnKeyDown}
      className={`relative overflow-hidden rounded-[14px] transition-colors duration-200 ${selected ? "bg-[var(--sx-surface-2)]" : "bg-[var(--sx-surface)]"} ${onClick ? "cursor-pointer hover:bg-[var(--sx-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" : ""} ${className}`}
      {...divRest}
    >
      <div className={`relative h-full w-full ${innerClassName}`}>{children}</div>
    </div>
  );
}
