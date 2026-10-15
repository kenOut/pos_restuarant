// Money is held as integer pesewas (1 GH₵ = 100 pesewas) to avoid floating-point drift.

export type Pesewas = number;

export function cedis(amount: number): Pesewas {
  return Math.round(amount * 100);
}

/** "340.00", "64,782.00". Formatted by hand so server and browser output always match. */
export function formatAmount(pesewas: Pesewas): string {
  const negative = pesewas < 0;
  const abs = Math.abs(pesewas);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** "GH₵ 408.00" */
export function formatCedis(pesewas: Pesewas): string {
  return `GH₵ ${formatAmount(pesewas)}`;
}
