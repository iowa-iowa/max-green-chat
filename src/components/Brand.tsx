export function Mark({ className = '' }: { className?: string }) {
  return <svg className={`max-mark ${className}`} viewBox="0 0 64 64" aria-hidden="true">
    <path fill="currentColor" d="M51 29c0 13-9 22-23 22h-8L8 57l4-16a27 27 0 0 1-3-12C9 15 18 6 31 6s20 9 20 23Z" />
    <circle cx="32" cy="28" r="11" className="mark-cutout" />
  </svg>;
}

export function Brand() {
  return <div className="brand"><span className="brand-symbol"><Mark /></span><span>MAX<span className="brand-sub">веб-чат</span></span></div>;
}
