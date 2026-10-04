import { Panel } from "@/components/cc/Panel";

/** Before/after row card: restyled as Panel with before/after columns in mono. */
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
    <Panel cut={8} className="w-full">
      <div className="p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
            {title} STATE DIFF
          </span>
          <span className="font-mono text-[10px] text-[#8b96b0]">
            BEFORE vs AFTER
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">
                <th className="py-1.5 pr-3 font-normal">Field</th>
                <th className="py-1.5 pr-3 font-normal">Before</th>
                <th className="py-1.5 text-right font-normal">After</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const b = fmt(before[k]);
                const a = fmt(after[k]);
                const changed = b !== a;
                return (
                  <tr
                    key={k}
                    className={`border-b border-white/[0.06] ${
                      changed ? "bg-[#3d5bff]/10" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-3 text-[#8b96b0] flex items-center gap-1.5">
                      {changed && (
                        <span className="inline-block size-1.5 rounded-none bg-[#3d5bff]" />
                      )}
                      <span>{k}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-[#8b96b0]">{b}</td>
                    <td
                      className={`py-1.5 text-right font-semibold ${
                        changed ? "text-[#7fb2ff]" : "text-[#dfe6f5]"
                      }`}
                    >
                      {a}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
