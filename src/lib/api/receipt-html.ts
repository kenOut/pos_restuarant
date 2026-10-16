// A self-contained 80 mm receipt page for systems that want to show or print
// a receipt exactly as the till does (GET /api/v1/receipts/{id}?format=html).
import { formatAmount, formatCedis } from "@/lib/money";
import { METHOD_LABELS, NETWORK_LABELS } from "@/lib/payments/labels";
import { ORDER_TYPE_LABELS } from "@/lib/orders/shared";
import type { Receipt } from "./data";

const escape = (s: string | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// Ghana time, as on the printed receipt.
const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });
const row = (left: string, right: string, strong = false) =>
  `<div class="row${strong ? " strong" : ""}"><span>${left}</span><span>${right}</span></div>`;

export function receiptHtml(r: Receipt): string {
  const title = r.kind === "receipt" ? "RECEIPT" : "BILL";
  const where = r.table ? ` · Table ${escape(r.table)}` : r.customer_name ? ` · ${escape(r.customer_name)}` : "";
  const time = r.paid_at ? `Paid ${when.format(new Date(r.paid_at))}` : `Opened ${when.format(new Date(r.opened_at!))}`;
  const lines = r.lines
    .map((l) => row(`${l.quantity}× ${escape(l.name)}`, formatAmount(l.amount)) + (l.note ? `<div class="note">${escape(l.note)}</div>` : ""))
    .join("");
  const money = [
    row("Subtotal", formatAmount(r.subtotal)),
    r.discount ? row(`Discount${r.discount_reason ? ` (${escape(r.discount_reason)})` : ""}`, `−${formatAmount(r.discount)}`) : "",
    ...r.tax_lines.map((t) => row(escape(t.label) + (r.prices_include_tax ? " (included)" : ""), formatAmount(t.amount))),
    r.tip ? row("Tip", formatAmount(r.tip)) : "",
    row("TOTAL", formatCedis(r.total), true),
  ].join("");
  const paid = r.payments
    .map((p) => row(escape(METHOD_LABELS[p.method]) + (p.network ? ` (${escape(NETWORK_LABELS[p.network])})` : ""), formatAmount(p.amount)) + (p.change ? row("Change", formatAmount(p.change)) : ""))
    .join("");
  return `<!doctype html>
<html lang="en-GH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} #${r.order_number} · ${escape(r.restaurant_name)}</title>
<style>
  body { margin: 0; background: #fff; color: #000; font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace; }
  main { width: 80mm; max-width: 100%; margin: 0 auto; padding: 16px; box-sizing: border-box; }
  h1 { font-size: 15px; text-align: center; margin: 0; }
  .centre { text-align: center; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .strong { font-weight: 700; font-size: 14px; }
  .note { padding-left: 1.5em; font-style: italic; }
  hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
</style></head>
<body><main>
  <h1>${escape(r.restaurant_name)}</h1>
  <p class="centre"><strong>${title}</strong><br>Order #${r.order_number} · ${escape(ORDER_TYPE_LABELS[r.type])}${where}<br>Served by ${escape(r.staff_name)}<br>${time}</p>
  <hr>${lines}<hr>${money}${paid ? `<hr>${paid}` : ""}
  ${r.balance && r.kind === "bill" ? `<hr>${row("Still to pay", formatCedis(r.balance), true)}` : ""}
  ${r.footer ? `<hr><p class="centre">${escape(r.footer)}</p>` : ""}
</main></body></html>`;
}
