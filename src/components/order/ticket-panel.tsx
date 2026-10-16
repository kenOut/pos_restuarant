"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/icons";
import { ORDER_TYPES, type OrderType } from "@/db/enums";
import { draftTotals, unsentCount, type Draft } from "@/lib/orders/draft";
import { taxLinesForDisplay } from "@/lib/payments/bill";
import type { TaxConfig } from "@/lib/tax-config";
import { LABEL_MAX, NOTE_MAX, ORDER_TYPE_LABELS, QUICK_NOTES } from "@/lib/orders/shared";
import { formatAmount, formatCedis } from "@/lib/money";
import type { TableOption } from "@/lib/tables/service";

type Props = {
  draft: Draft;
  taxConfig: TaxConfig;
  staffName: string;
  pending: boolean;
  error: string | null;
  onType: (type: OrderType) => void;
  /** Floor plan tables; when there are some, dine-in picks one instead of typing. */
  tables: TableOption[];
  onTableLabel: (value: string) => void;
  onTable: (table: TableOption | null) => void;
  onGuests: (value: string) => void;
  onCustomerName: (value: string) => void;
  onQuantity: (key: string, delta: number) => void;
  onNote: (key: string, note: string) => void;
  onHold: () => void;
  onSend: () => void;
  /** Saves any changes (as held) and opens the pay screen. */
  onPay: () => void;
  /** Phones only: close the full-screen ticket. */
  onClose?: () => void;
  className?: string;
};

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

const DETAIL_FIELD: Record<OrderType, { label: string; placeholder: string; field: "tableLabel" | "customerName"; required: boolean }> = {
  dine_in: { label: "Table", placeholder: "e.g. T7", field: "tableLabel", required: true },
  takeaway: { label: "Customer name (optional)", placeholder: "e.g. Kwame", field: "customerName", required: false },
  delivery: { label: "Customer name and phone", placeholder: "e.g. Ama, 024 000 5821", field: "customerName", required: true },
};

export function TicketPanel(props: Props) {
  const { draft, staffName, pending, error, className = "" } = props;
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const fieldId = useId();
  const totals = draftTotals(draft, props.taxConfig);
  const toSend = unsentCount(draft);
  const hasItems = draft.sent.length + draft.lines.length > 0;
  const detail = DETAIL_FIELD[draft.type];

  return (
    <aside aria-labelledby={`${fieldId}-title`} className={`flex-col border-ink-700 bg-ink-850 md:w-[21rem] md:border-l lg:w-[24rem] ${className}`}>
      {/* Header */}
      <div className="flex items-start gap-2 border-b border-ink-700 p-4">
        <div className="min-w-0 flex-1">
          <h2 id={`${fieldId}-title`} className="font-display text-xl font-bold">
            {ORDER_TYPE_LABELS[draft.type]}
            {draft.number ? <span className="text-cream-muted"> · #{draft.number}</span> : null}
          </h2>
          <p className="truncate text-sm text-cream-faint">{draft.staffName ?? staffName}</p>
        </div>
        {props.onClose ? (
          <button type="button" onClick={props.onClose} aria-label="Back to the menu" className="grid size-11 place-items-center rounded-xl border border-ink-600 md:hidden">
            <Icon name="plus" className="size-5 rotate-45" />
          </button>
        ) : null}
      </div>

      {/* Order type and table / customer */}
      <div className="space-y-3 border-b border-ink-700 p-4">
        <div role="radiogroup" aria-label="Order type" className="grid grid-cols-3 rounded-xl bg-ink-950 p-1">
          {ORDER_TYPES.map((type) => {
            const selected = draft.type === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => props.onType(type)}
                className={`min-h-11 rounded-lg text-sm font-medium transition-colors motion-reduce:transition-none ${
                  selected ? "bg-ink-700 text-cream" : "text-cream-muted hover:text-cream"
                }`}
              >
                {ORDER_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
        {draft.type === "dine_in" && props.tables.length > 0 ? (
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <div>
              <label htmlFor={`${fieldId}-table`} className="text-sm text-cream-muted">
                Table
              </label>
              <select
                id={`${fieldId}-table`}
                name="table"
                value={draft.tableId ?? ""}
                onChange={(e) => props.onTable(props.tables.find((t) => t.id === e.target.value) ?? null)}
                aria-required
                className="mt-1 h-11 w-full rounded-xl border border-ink-600 bg-ink-900 px-2 text-cream focus:border-amber focus:outline-none"
              >
                <option value="">Choose a table</option>
                {[...new Set(props.tables.map((t) => t.area))].map((area) => (
                  <optgroup key={area} label={area}>
                    {props.tables
                      .filter((t) => t.area === area)
                      .map((t) => {
                        // A table with another order open can't take a second one.
                        const taken = t.orderId !== null && t.orderId !== draft.orderId;
                        return (
                          <option key={t.id} value={t.id} disabled={taken}>
                            {t.label} · {t.seats} seats{taken ? " · in use" : t.reservedTime ? ` · reserved ${t.reservedTime}` : ""}
                          </option>
                        );
                      })}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${fieldId}-guests`} className="text-sm text-cream-muted">
                Guests
              </label>
              <input
                id={`${fieldId}-guests`}
                name="guests"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={draft.guests}
                onChange={(e) => props.onGuests(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-ink-600 bg-ink-900 px-3 text-cream focus:border-amber focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor={`${fieldId}-detail`} className="text-sm text-cream-muted">
              {detail.label}
            </label>
            <input
              id={`${fieldId}-detail`}
              value={detail.field === "tableLabel" ? draft.tableLabel : draft.customerName}
              onChange={(e) => (detail.field === "tableLabel" ? props.onTableLabel(e.target.value) : props.onCustomerName(e.target.value))}
              placeholder={detail.placeholder}
              maxLength={LABEL_MAX}
              autoComplete="off"
              aria-required={detail.required}
              className="mt-1 h-11 w-full rounded-xl border border-ink-600 bg-ink-900 px-3 text-cream placeholder:text-cream-faint/70 focus:border-amber focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {!hasItems ? (
          <p className="py-10 text-center text-cream-muted">Tap a dish to start the order.</p>
        ) : (
          <ul className="divide-y divide-ink-700">
            {draft.sent.map((line) => (
              <li key={line.id} className="py-3 text-cream-muted">
                <div className="flex justify-between gap-3">
                  <span>
                    {line.quantity}× {line.name}
                  </span>
                  <span className="tabular-nums">{formatAmount(line.unitPrice * line.quantity)}</span>
                </div>
                {line.note ? <p className="mt-0.5 text-sm text-amber/80">{line.note}</p> : null}
                <p className="mt-1 flex items-center gap-1 text-xs text-eating-text">
                  <Icon name="check" className="size-3.5" />
                  Sent {line.sentAt ? timeFormat.format(line.sentAt) : ""}
                </p>
              </li>
            ))}
            {draft.lines.map((line) => {
              const editing = noteFor === line.key;
              return (
                <li key={line.key} className="animate-line-in py-3">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{line.name}</span>
                    <span className="tabular-nums">GH₵ {formatAmount(line.unitPrice * line.quantity)}</span>
                  </div>
                  {line.note && !editing ? <p className="mt-0.5 text-sm text-amber">{line.note}</p> : null}
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => props.onQuantity(line.key, -1)}
                        aria-label={line.quantity === 1 ? `Remove ${line.name}` : `One less ${line.name}`}
                        className="grid size-11 place-items-center rounded-lg bg-ink-700 hover:bg-ink-600 active:scale-95"
                      >
                        <Icon name="minus" className="size-4" />
                      </button>
                      <span className="w-8 text-center font-semibold tabular-nums" aria-label={`Quantity ${line.quantity}`}>
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => props.onQuantity(line.key, 1)}
                        aria-label={`One more ${line.name}`}
                        className="grid size-11 place-items-center rounded-lg bg-ink-700 hover:bg-ink-600 active:scale-95"
                      >
                        <Icon name="plus" className="size-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNoteFor(editing ? null : line.key)}
                      aria-expanded={editing}
                      className={`flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm ${editing ? "bg-amber-soft text-amber" : "bg-ink-700 hover:bg-ink-600"}`}
                    >
                      <Icon name="note" className="size-4" />
                      {editing ? "Done" : "Note"}
                    </button>
                  </div>
                  {editing ? (
                    <div className="mt-2 space-y-2">
                      <input
                        autoFocus
                        value={line.note}
                        onChange={(e) => props.onNote(line.key, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && setNoteFor(null)}
                        maxLength={NOTE_MAX}
                        placeholder="Note for the kitchen"
                        aria-label={`Note for ${line.name}`}
                        className="h-11 w-full rounded-xl border border-ink-600 bg-ink-900 px-3 text-cream placeholder:text-cream-faint/70 focus:border-amber focus:outline-none"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_NOTES.map((quick) => (
                          <button
                            key={quick}
                            type="button"
                            onClick={() => props.onNote(line.key, line.note ? `${line.note}, ${quick.toLowerCase()}` : quick)}
                            className="min-h-11 rounded-full border border-ink-600 px-3.5 text-sm text-cream-muted hover:border-amber hover:text-cream"
                          >
                            {quick}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Totals and actions */}
      <div className="border-t border-ink-700 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-4">
        <dl className="space-y-0.5 text-sm text-cream-muted">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatCedis(totals.subtotal)}</dd>
          </div>
          {totals.pricesIncludeTax && totals.taxes.length ? <div className="pt-0.5 text-xs">Prices include:</div> : null}
          {taxLinesForDisplay(totals.taxes).map((tax) => (
            <div key={tax.label} className={`flex justify-between ${totals.pricesIncludeTax ? "pl-3" : ""}`}>
              <dt>{tax.label}</dt>
              <dd className="tabular-nums">{formatCedis(tax.amount)}</dd>
            </div>
          ))}
          <div className="flex justify-between pt-1 text-lg font-bold text-cream">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCedis(totals.total)}</dd>
          </div>
        </dl>

        <p role="alert" className="mt-2 min-h-5 text-sm text-alert">
          {error}
        </p>

        <div className="mt-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={props.onHold}
            disabled={pending || !draft.dirty || !hasItems}
            className="min-h-12 rounded-xl border border-ink-600 bg-ink-800 font-semibold enabled:hover:bg-ink-700 enabled:active:scale-[0.98] disabled:opacity-40"
          >
            Hold
          </button>
          <button
            type="button"
            onClick={props.onSend}
            disabled={pending || toSend === 0}
            className="min-h-12 rounded-xl border border-ink-600 bg-ink-800 font-semibold enabled:hover:bg-ink-700 enabled:active:scale-[0.98] disabled:opacity-40"
          >
            Send to kitchen{toSend ? ` (${toSend})` : ""}
          </button>
        </div>
        <button
          type="button"
          onClick={props.onPay}
          disabled={pending || !hasItems}
          className="mt-2 min-h-12 w-full rounded-xl bg-amber font-semibold text-amber-ink enabled:hover:bg-[#f5b552] enabled:active:scale-[0.99] disabled:opacity-40"
        >
          Pay {formatCedis(totals.total)}
        </button>
        <p className="mt-1 min-h-4 text-center text-xs text-cream-faint">{pending ? "Saving…" : ""}</p>
      </div>
    </aside>
  );
}
