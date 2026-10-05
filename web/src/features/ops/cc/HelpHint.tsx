export function HelpHint({ text }: { text: string }) {
  return (
    <span
      tabIndex={0}
      role="img"
      className="inline-flex items-center justify-center size-3.5 rounded-full border border-[var(--sx-hairline-strong)] bg-white/[0.04] text-[10px] text-[var(--sx-text-3)] hover:text-white hover:border-white/40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white cursor-help shrink-0 align-middle ml-1 transition-colors"
      title={text}
      aria-label={text}
    >
      ?
    </span>
  );
}

