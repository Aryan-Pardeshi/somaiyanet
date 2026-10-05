import { useEffect, useRef, useState } from "react";
import { ScrollTrigger } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * A DB row as an inset-grouped list: title as `.sx-eyebrow`, each
 * key/value pair a `.sx-row`. Mono only on the SQL column values.
 * Slides in once; reduced motion shows the end state.
 */
export function RowCard({
  title,
  rows,
  className,
}: {
  title: string;
  rows: Array<[string, string]>;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const el = ref.current;
    if (!el) return;
    const st = ScrollTrigger.create({
      trigger: el,
      start: "top 88%",
      once: true,
      onEnter: () => setInView(true),
    });
    return () => {
      st.kill();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "sx-group w-full transition-all duration-500",
        inView ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0",
        className,
      )}
    >
      <p className="sx-eyebrow px-[18px] pt-3 pb-1">{title}</p>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} className="sx-row !min-h-[48px]">
            <dt className="sx-body shrink-0">{k}</dt>
            <dd className="truncate text-right font-mono text-[12px] text-white">
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
