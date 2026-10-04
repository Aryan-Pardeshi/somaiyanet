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
  const outerCut = cut;
  const innerCut = Math.max(0, cut - 0.4);

  const outerPolygon = `polygon(${outerCut}px 0%, calc(100% - ${outerCut}px) 0%, 100% ${outerCut}px, 100% calc(100% - ${outerCut}px), calc(100% - ${outerCut}px) 100%, ${outerCut}px 100%, 0% calc(100% - ${outerCut}px), 0% ${outerCut}px)`;
  const innerPolygon = `polygon(${innerCut}px 0%, calc(100% - ${innerCut}px) 0%, 100% ${innerCut}px, 100% calc(100% - ${innerCut}px), calc(100% - ${innerCut}px) 100%, ${innerCut}px 100%, 0% calc(100% - ${innerCut}px), 0% ${innerCut}px)`;

  const resolvedBorder =
    borderColor ??
    (selected
      ? "rgba(61, 91, 255, 0.45)"
      : "rgba(255, 255, 255, 0.09)");

  const resolvedBg =
    backgroundColor ??
    (selected
      ? "rgba(14, 23, 44, 0.88)"
      : "rgba(6, 11, 23, 0.72)");

  const outerStyle: React.CSSProperties = {
    clipPath: outerPolygon,
    WebkitClipPath: outerPolygon,
    backgroundColor: resolvedBorder,
  };

  const innerStyle: React.CSSProperties = {
    clipPath: innerPolygon,
    WebkitClipPath: innerPolygon,
    backgroundColor: resolvedBg,
  };

  const containerStyle: React.CSSProperties = {
    ...style,
    ...(glowColor ? { filter: `drop-shadow(0 0 10px ${glowColor})` } : {}),
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
      className={`relative transition-[background-color,border-color,transform,filter] duration-200 ${onClick ? "cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#3d5bff]" : ""} ${className}`}
      {...divRest}
    >
      <div style={outerStyle} className="h-full w-full p-[1px]">
        <div
          style={innerStyle}
          className={`relative h-full w-full backdrop-blur-xl ${innerClassName}`}
        >
          {selected && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-2 bottom-2 w-[3px] bg-[#3d5bff]"
            />
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
