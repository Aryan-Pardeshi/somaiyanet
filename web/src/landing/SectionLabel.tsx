/** Small mono uppercase label with royal dot: `● LABEL`. */
export function SectionLabel({ children }: { children: string }) {
  return (
    <p
      className="font-mono flex items-center gap-2 text-[11px] uppercase"
      style={{ letterSpacing: "0.08em", color: "#9aa3b8" }}
    >
      <span
        aria-hidden="true"
        className="inline-block size-[6px] rounded-full"
        style={{ background: "var(--royal)" }}
      />
      {children}
    </p>
  );
}
