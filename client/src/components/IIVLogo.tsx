export function IIVLogo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="IIV Intelligence Portal"
      className={className}
    >
      {/* I */}
      <rect x="6" y="10" width="8" height="40" rx="2" fill="currentColor" />
      {/* I */}
      <rect x="20" y="10" width="8" height="40" rx="2" fill="currentColor" />
      {/* Diagonal slash */}
      <rect x="30" y="8" width="3" height="48" rx="1" fill="currentColor" opacity="0.4" transform="rotate(12 31.5 32)" />
      {/* V */}
      <path d="M38 10L46 50L54 10" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function IIVLogoFull({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <IIVLogo size={36} />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-bold tracking-wider">IIV</span>
        <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">Intelligence Portal</span>
      </div>
    </div>
  );
}
