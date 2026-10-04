/** Before/after row card: changed values glow ice blue. */
export function DiffCard({
  title,
  before,
  after,
}: {
  title: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  return (
    <div className="w-full rounded-xl border border-[var(--line)] bg-[var(--navy-800)]">
      <p className="font-mono border-b border-[var(--line)] px-4 py-2 text-[11px] tracking-[0.18em] text-[var(--ice)]">
        {title}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3">
        {keys.map((k) => {
          const b = fmt(before[k]);
          const a = fmt(after[k]);
          const changed = b !== a;
          return (
            <div key={k} className="contents">
              <dt className="font-mono text-[12px] text-[var(--text-3)]">
                {changed ? "● " : ""}
                {k}
              </dt>
              <dd
                className="font-mono text-[12px]"
                style={{ color: changed ? "var(--ice)" : "var(--text)" }}
              >
                {changed ? `${b} → ${a}` : a}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
