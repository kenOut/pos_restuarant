type ComingSoonProps = { title: string; personName: string; phase: string; children: React.ReactNode };

/** Placeholder for till screens that later phases build. */
export function ComingSoon({ title, personName, phase, children }: ComingSoonProps) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-bold tracking-[0.18em] text-amber uppercase">{phase}</p>
      <h1 className="mt-3 font-display text-4xl font-bold">{title}</h1>
      <p className="mt-4 text-lg text-cream-muted">Signed in as {personName.replace(/\.$/, "")}.</p>
      <p className="mt-2 text-cream-muted">{children}</p>
    </div>
  );
}
