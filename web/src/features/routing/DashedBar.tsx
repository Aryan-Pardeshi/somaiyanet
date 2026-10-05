interface DashedBarProps {
  value: number;
  max?: number;
  segments?: number;
  fillColor?: string;
  className?: string;
}

export function DashedBar({
  value,
  max = 100,
  segments = 14,
  fillColor = "rgba(255, 255, 255, 0.7)",
  className = "",
}: DashedBarProps) {
  const ratio = Math.max(0, Math.min(1, value / max));
  const activeCount = Math.round(ratio * segments);

  return (
    <div
      className={`flex items-center gap-[2px] h-1.5 w-full ${className}`}
      role="presentation"
    >
      {Array.from({ length: segments }, (_, i) => {
        const isActive = i < activeCount;
        return (
          <span
            key={i}
            className="flex-1 h-full rounded-[1px]"
            style={{
              backgroundColor: isActive
                ? fillColor
                : "rgba(255, 255, 255, 0.08)",
            }}
          />
        );
      })}
    </div>
  );
}
