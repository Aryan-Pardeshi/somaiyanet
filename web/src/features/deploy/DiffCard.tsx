import { Panel } from "@/components/cc/Panel";

/** Before/after row card: inset-grouped list with changed values in white, unchanged in white 45%. */
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
    <Panel className="w-full">
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-[var(--sx-hairline)] pb-2.5">
          <span className="sx-eyebrow">{title} state diff</span>
          <span className="sx-caption text-[var(--sx-text-3)]">Before vs After</span>
        </div>

        <div className="sx-group">
          <div className="sx-row text-[var(--sx-text-3)]">
            <span className="sx-eyebrow w-1/3">Column</span>
            <span className="sx-eyebrow w-1/3">Before</span>
            <span className="sx-eyebrow w-1/3 text-right">After</span>
          </div>
          {keys.map((k) => {
            const b = fmt(before[k]);
            const a = fmt(after[k]);
            const changed = b !== a;
            return (
              <div key={k} className="sx-row">
                <span className="font-mono text-[12px] text-[var(--sx-text-2)] w-1/3 truncate">
                  {k}
                </span>
                <span className="font-mono text-[12px] text-white/45 w-1/3 truncate">
                  {b}
                </span>
                <span
                  className={`font-mono text-[12px] w-1/3 text-right truncate ${
                    changed ? "text-white font-medium" : "text-white/45"
                  }`}
                >
                  {a}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

