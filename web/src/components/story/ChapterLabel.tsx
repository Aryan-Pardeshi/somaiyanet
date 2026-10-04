import { cn } from "@/lib/utils"

/**
 * Sentence-case section label with a small ice dot — never bracketed.
 * Renders like: ● Chapter 3
 */
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
    <p
      className={cn(
        "flex items-center gap-2 text-[13px] font-medium text-[var(--text-2)]",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="inline-block size-[6px] shrink-0 rounded-full bg-[var(--ice)]"
      />
      Chapter {Number.parseInt(index, 10)}
      <span className="sr-only">{` (section ${index}: ${title})`}</span>
    </p>
  );
}
