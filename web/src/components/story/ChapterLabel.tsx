import { cn } from "@/lib/utils"

/** Sentence-case section label in Geist Sans — never bracketed, never tracked out. */
export function ChapterLabel({
  index,
  title,
  className,
}: {
  index: string;
  title: string;
  className?: string;
}) {
  return (
    <p className={cn("text-[13px] font-medium text-[var(--text-2)]", className)}>
      {title}
      <span className="sr-only">{` (section ${index})`}</span>
    </p>
  );
}
