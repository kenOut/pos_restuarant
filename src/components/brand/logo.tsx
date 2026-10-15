type LogoProps = {
  /** Size of the "E" mark in pixels. */
  size?: number;
  /** Show the "ENYO POS" wordmark next to the mark. */
  withWordmark?: boolean;
  className?: string;
};

export function Logo({ size = 32, withWordmark = true, className = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden="true"
        className="grid place-items-center rounded-[22%] bg-amber font-display font-extrabold text-amber-ink"
        style={{ width: size, height: size, fontSize: size * 0.62, lineHeight: 1 }}
      >
        E
      </span>
      {withWordmark ? (
        <span className="font-display font-bold tracking-wide whitespace-nowrap" style={{ fontSize: size * 0.56 }}>
          ENYO POS
        </span>
      ) : (
        <span className="sr-only">ENYO POS</span>
      )}
    </span>
  );
}
