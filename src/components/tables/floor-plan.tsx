"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import {
  addAreaAction,
  addTableAction,
  changeServerAction,
  clearReservationAction,
  deleteAreaAction,
  deleteTableAction,
  moveOrderAction,
  placeTableAction,
  printBillAction,
  renameAreaAction,
  reserveTableAction,
  updateTableAction,
} from "@/app/b/[branch]/(till)/tables/actions";
import { Button, Dialog, Field, FormError, inputClass } from "@/components/admin/ui";
import { useBranchPath } from "@/components/tenancy/branch-context";
import { TABLE_SHAPES, type TableShape } from "@/db/enums";
import { formatCedis } from "@/lib/money";
import type { Floor, FloorTable, Result, Server } from "@/lib/tables/service";
import {
  AREA_NAME_MAX,
  FLOOR_COLS,
  FLOOR_ROWS,
  MAX_SEATS,
  RESERVED_NAME_MAX,
  SHAPE_LABELS,
  TABLE_LABEL_MAX,
  TABLE_STATUSES,
  TABLE_STATUS_LABELS,
  clampPosition,
  fits,
  tableSize,
  type TableStatus,
} from "@/lib/tables/shared";
import { useNow } from "@/lib/use-now";

type Props = { floor: Floor; servers: Server[]; canArrange: boolean };

/** The deck's colours: free (plain), ordering (amber), eating (green), waiting to pay (coral), reserved (blue). */
const STATUS_STYLE: Record<TableStatus, { table: string; dot: string }> = {
  free: { table: "border-ink-600 bg-ink-850", dot: "bg-ink-600" },
  ordering: { table: "border-amber bg-amber-soft", dot: "bg-amber" },
  eating: { table: "border-eating bg-eating-soft", dot: "bg-eating" },
  waiting: { table: "border-alert bg-alert-soft", dot: "bg-alert" },
  reserved: { table: "border-reserved bg-reserved-soft", dot: "bg-reserved" },
};

/** "45 min" or "1 h 05 min" since the order was opened. */
function seatedFor(openedAt: number, now: number | null): string {
  if (now === null) return "–";
  const minutes = Math.max(0, Math.floor((now - openedAt) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** Commas only screen readers hear, so the button's text reads as a sentence. */
const Sep = () => <span className="sr-only">, </span>;

/**
 * A table's button text. Its accessible name is this text, so it starts with
 * what's visible, then adds what the colour shows (status) and the order number,
 * e.g. "T4, Eating, order #1001, 3 guests, 12 min".
 */
function TableContent({ table, now, card = false, at }: { table: FloorTable; now: number | null; card?: boolean; at?: { x: number; y: number } }) {
  const label = card ? "font-display text-xl font-bold" : "font-display text-lg font-bold";
  if (at) {
    return (
      <>
        <span className={label}>{table.label}</span>
        <Sep />
        <span className="block text-xs text-cream-muted">{table.seats} seats</span>
        <span className="sr-only">
          , column {at.x + 1}, row {at.y + 1}. Arrow keys move it.
        </span>
      </>
    );
  }
  const guests = table.order?.guests ?? table.seats;
  return (
    <>
      <span className={label}>{table.label}</span>
      <Sep />
      <span className={card ? "block text-xs font-semibold" : "sr-only"}>{TABLE_STATUS_LABELS[table.status]}</span>
      {table.order ? (
        <>
          <span className="sr-only">, order #{table.order.number}</span>
          <Sep />
          <span className="block text-xs">
            {guests} guest{guests === 1 ? "" : "s"}
          </span>
          <Sep />
          <span className="block text-xs tabular-nums">{seatedFor(table.order.openedAt, now)}</span>
        </>
      ) : table.reservedTime ? (
        <>
          <Sep />
          <span className="block text-xs">Reserved {table.reservedTime}</span>
        </>
      ) : (
        <>
          <Sep />
          <span className="block text-xs text-cream-muted">{table.seats} seats</span>
        </>
      )}
    </>
  );
}

export function FloorPlan({ floor, servers, canArrange }: Props) {
  const now = useNow();
  const [areaId, setAreaId] = useState(floor.areas[0]?.id ?? "");
  const [arranging, setArranging] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FloorTable | "new" | null>(null);
  const [areaDialog, setAreaDialog] = useState<"add" | "rename" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const area = floor.areas.find((a) => a.id === areaId) ?? floor.areas[0];
  const tables = floor.tables.filter((t) => t.areaId === area?.id);
  const counts = Object.fromEntries(TABLE_STATUSES.map((s) => [s, floor.tables.filter((t) => t.status === s).length])) as Record<TableStatus, number>;
  const open = floor.tables.find((t) => t.id === openId) ?? null;

  /** Runs an action; shows its error, if any. */
  const act = (action: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setMessage(result.error);
      else {
        setMessage(null);
        after?.();
      }
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-ink-700 p-3 sm:p-4">
        <h1 className="font-display text-2xl font-bold">{arranging ? "Arrange tables" : "Tables"}</h1>
        <div role="group" aria-label="Areas" className="flex flex-wrap gap-2">
          {floor.areas.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={a.id === area?.id}
              onClick={() => setAreaId(a.id)}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium ${a.id === area?.id ? "border-amber bg-amber-soft text-cream" : "border-ink-700 bg-ink-850 text-cream-muted hover:text-cream"}`}
            >
              {a.name}
              <span className="ml-1.5 text-xs text-cream-faint">{floor.tables.filter((t) => t.areaId === a.id).length}</span>
            </button>
          ))}
        </div>
        {canArrange ? (
          <Button
            className="ml-auto hidden md:inline-flex"
            variant={arranging ? "primary" : "secondary"}
            aria-pressed={arranging}
            onClick={() => {
              setArranging((on) => !on);
              setMessage(null);
            }}
          >
            {arranging ? "Done arranging" : "Arrange"}
          </Button>
        ) : null}
      </header>

      {arranging ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 bg-ink-850 px-3 py-2 text-sm sm:px-4">
          <p className="mr-auto text-cream-muted">Drag tables into place, or select one and use the arrow keys. Tap a table to edit it.</p>
          <Button variant="primary" onClick={() => setEditing("new")} disabled={!area}>
            Add table
          </Button>
          <Button onClick={() => setAreaDialog("add")}>Add area</Button>
          <Button onClick={() => setAreaDialog("rename")} disabled={!area}>
            Rename {area?.name}
          </Button>
          <Button variant="danger" disabled={!area || pending} onClick={() => area && window.confirm(`Remove the area ${area.name}?`) && act(() => deleteAreaAction(area.id), () => setAreaId(""))}>
            Remove area
          </Button>
        </div>
      ) : (
        <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 border-b border-ink-700 px-3 py-2 text-sm sm:px-4">
          {TABLE_STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-1.5 text-cream-muted">
              <span aria-hidden className={`size-3 rounded-full ${STATUS_STYLE[s].dot}`} />
              {TABLE_STATUS_LABELS[s]} <span className="tabular-nums text-cream">{counts[s]}</span>
            </li>
          ))}
        </ul>
      )}

      <p role="status" aria-live="polite" className={message ? "bg-alert-soft px-4 py-2 text-sm" : "sr-only"}>
        {message}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 sm:p-4 md:pb-4">
        {tables.length === 0 ? (
          <p className="py-12 text-center text-cream-muted">
            {canArrange ? `No tables in ${area?.name ?? "this area"} yet. Choose Arrange to add some.` : `No tables in ${area?.name ?? "this area"} yet.`}
          </p>
        ) : null}

        {/* Phones: a list of tables */}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:hidden">
          {tables.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setOpenId(t.id)}
                data-table-card={t.label}
                className={`flex min-h-24 w-full flex-col items-start rounded-2xl border-2 p-3 text-left ${STATUS_STYLE[t.status].table}`}
              >
                <TableContent table={t} now={now} card />
              </button>
            </li>
          ))}
        </ul>

        {/* Tablets and computers: the floor plan */}
        {tables.length || arranging ? (
          <FloorCanvas
            key={area?.id}
            tables={tables}
            arranging={arranging}
            now={now}
            onOpen={(t) => (arranging ? setEditing(t) : setOpenId(t.id))}
            onPlace={(t, x, y) => act(() => placeTableAction(t.id, x, y))}
          />
        ) : null}
      </div>

      <TablePanel
        table={arranging ? null : open}
        floor={floor}
        servers={servers}
        pending={pending}
        onClose={() => {
          setOpenId(null);
          setMessage(null);
        }}
        act={act}
        error={open ? message : null}
      />

      {editing ? (
        <TableEditor
          table={editing === "new" ? null : editing}
          areas={floor.areas}
          defaultAreaId={area?.id ?? ""}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {areaDialog ? <AreaEditor mode={areaDialog} area={areaDialog === "rename" ? area : undefined} onClose={() => setAreaDialog(null)} onAdded={() => setAreaId("")} /> : null}
    </div>
  );
}

/** The grid. In arrange mode tables can be dragged or moved with the arrow keys. */
function FloorCanvas({
  tables,
  arranging,
  now,
  onOpen,
  onPlace,
}: {
  tables: FloorTable[];
  arranging: boolean;
  now: number | null;
  onOpen: (t: FloorTable) => void;
  onPlace: (t: FloorTable, x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Where tables are being moved to, until the saved floor plan comes back.
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  const [seen, setSeen] = useState(tables);
  if (seen !== tables) {
    setSeen(tables);
    setMoved({});
  }
  const [announce, setAnnounce] = useState("");
  const drag = useRef<{ id: string; startX: number; startY: number; from: { x: number; y: number }; moved: boolean } | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  const at = (t: FloorTable) => moved[t.id] ?? { x: t.x, y: t.y };
  const placed = tables.map((t) => ({ id: t.id, seats: t.seats, ...at(t) }));
  const canGo = (t: FloorTable, spot: { x: number; y: number }) => fits({ id: t.id, seats: t.seats, ...spot }, placed);

  const cell = () => {
    const box = ref.current!.getBoundingClientRect();
    return { w: box.width / FLOOR_COLS, h: box.height / FLOOR_ROWS };
  };

  const moveTo = (t: FloorTable, x: number, y: number) => {
    const spot = clampPosition(x, y, t.seats);
    if (!canGo(t, spot)) return false;
    setMoved((m) => ({ ...m, [t.id]: spot }));
    return true;
  };

  return (
    <div className="hidden md:block">
      <div
        ref={ref}
        className={`relative w-full rounded-2xl border border-ink-700 bg-ink-900 ${arranging ? "bg-[linear-gradient(to_right,var(--color-ink-800)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-ink-800)_1px,transparent_1px)]" : ""}`}
        style={{ aspectRatio: `${FLOOR_COLS} / ${FLOOR_ROWS}`, backgroundSize: `${100 / FLOOR_COLS}% ${100 / FLOOR_ROWS}%` }}
      >
        {tables.map((t) => {
          const { x, y } = at(t);
          const { w, h } = tableSize(t.seats);
          return (
            <button
              key={t.id}
              type="button"
              data-table={t.label}
              className={`absolute flex touch-none flex-col items-center justify-center border-2 p-1 text-center leading-tight select-none ${t.shape === "round" ? "rounded-full" : "rounded-xl"} ${STATUS_STYLE[t.status].table} ${arranging ? "cursor-grab active:cursor-grabbing" : "hover:brightness-125"}`}
              style={{
                left: `calc(${(x / FLOOR_COLS) * 100}% + 4px)`,
                top: `calc(${(y / FLOOR_ROWS) * 100}% + 4px)`,
                width: `calc(${(w / FLOOR_COLS) * 100}% - 8px)`,
                height: `calc(${(h / FLOOR_ROWS) * 100}% - 8px)`,
              }}
              onClick={() => {
                // A drag ends with a click; only a tap opens the table.
                if (drag.current?.moved) return;
                onOpen(t);
              }}
              onPointerDown={(e) => {
                if (!arranging) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { id: t.id, startX: e.clientX, startY: e.clientY, from: at(t), moved: false };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!arranging || !d || d.id !== t.id) return;
                const size = cell();
                const dx = Math.round((e.clientX - d.startX) / size.w);
                const dy = Math.round((e.clientY - d.startY) / size.h);
                if (dx || dy) d.moved = true;
                moveTo(t, d.from.x + dx, d.from.y + dy);
              }}
              onPointerUp={() => {
                const d = drag.current;
                if (!arranging || !d || d.id !== t.id) return;
                const spot = at(t);
                if (d.moved && (spot.x !== d.from.x || spot.y !== d.from.y)) onPlace(t, spot.x, spot.y);
                // Let the click that follows see that this was a drag.
                window.setTimeout(() => (drag.current = null), 0);
              }}
              onKeyDown={(e) => {
                if (!arranging) return;
                const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
                if (!step) return;
                e.preventDefault();
                const from = at(t);
                if (moveTo(t, from.x + step[0], from.y + step[1])) {
                  const next = clampPosition(from.x + step[0], from.y + step[1], t.seats);
                  setAnnounce(`${t.label}: column ${next.x + 1}, row ${next.y + 1}`);
                  window.clearTimeout(saveTimer.current);
                  saveTimer.current = window.setTimeout(() => onPlace(t, next.x, next.y), 400);
                } else setAnnounce(`${t.label} can't go there`);
              }}
            >
              <TableContent table={t} now={now} at={arranging ? { x, y } : undefined} />
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </div>
  );
}

/** What can be done at a table: its order, or seating and reserving it. */
function TablePanel({
  table,
  floor,
  servers,
  pending,
  error,
  onClose,
  act,
}: {
  table: FloorTable | null;
  floor: Floor;
  servers: Server[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  act: (action: () => Promise<Result>, after?: () => void) => void;
}) {
  const id = useId();
  const router = useRouter();
  const branchPath = useBranchPath();
  const now = useNow();
  const order = table?.order ?? null;
  const [moveTo, setMoveTo] = useState("");
  const [serverId, setServerId] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  // Fresh choices whenever another table is opened.
  const [shownId, setShownId] = useState<string | null>(null);
  if ((table?.id ?? null) !== shownId) {
    setShownId(table?.id ?? null);
    setMoveTo("");
    setServerId(order?.staffId ?? "");
    setTime(table?.reservedTime ?? "");
    setName(table?.reservedName ?? "");
  }

  const areaName = (areaId: string) => floor.areas.find((a) => a.id === areaId)?.name ?? "";
  const freeTables = floor.tables.filter((t) => !t.order && t.id !== table?.id);
  const partPaid = (order?.paid ?? 0) > 0;
  const linkClass = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold";

  return (
    <Dialog open={!!table} title={table ? `${table.label} · ${TABLE_STATUS_LABELS[table.status]}` : ""} onClose={onClose}>
      {table ? (
        <div className="space-y-4">
          <p className="text-sm text-cream-muted">
            {areaName(table.areaId)} · {table.seats} seats · {SHAPE_LABELS[table.shape]}
          </p>

          {order ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-ink-700 bg-ink-850 p-3 text-sm">
                <div><dt className="text-cream-muted">Order</dt><dd className="font-semibold">#{order.number}</dd></div>
                <div><dt className="text-cream-muted">Server</dt><dd className="font-semibold">{order.staffName}</dd></div>
                <div><dt className="text-cream-muted">Guests</dt><dd className="font-semibold">{order.guests ?? "–"}</dd></div>
                <div><dt className="text-cream-muted">Seated</dt><dd className="font-semibold tabular-nums">{seatedFor(order.openedAt, now)}</dd></div>
                <div><dt className="text-cream-muted">Items</dt><dd className="font-semibold tabular-nums">{order.itemCount}</dd></div>
                <div>
                  <dt className="text-cream-muted">Total</dt>
                  <dd className="font-semibold tabular-nums">{formatCedis(order.total)}</dd>
                </div>
                {partPaid ? (
                  <div className="col-span-2"><dt className="text-cream-muted">Paid so far</dt><dd className="font-semibold tabular-nums">{formatCedis(order.paid)}</dd></div>
                ) : null}
              </dl>

              <div className="grid grid-cols-2 gap-2">
                {partPaid ? (
                  <span className={`${linkClass} border border-ink-700 text-cream-faint`} title="Part paid: finish on the pay screen">Add items</span>
                ) : (
                  <Link href={branchPath(`/order?open=${order.id}`)} className={`${linkClass} border border-ink-600 bg-ink-850 hover:bg-ink-800`}>
                    Add items
                  </Link>
                )}
                <Button
                  disabled={pending || order.itemCount === 0}
                  onClick={() => act(() => printBillAction(order.id), () => router.push(branchPath(`/receipt/${order.id}?print=1&from=tables`)))}
                >
                  Print bill
                </Button>
                <Link href={branchPath(`/pay/${order.id}`)} className={`${linkClass} col-span-2 bg-amber text-amber-ink hover:bg-[#f5b552]`}>
                  Take payment
                </Link>
              </div>

              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => moveOrderAction(order.id, moveTo), onClose);
                }}
              >
                <div className="min-w-0 flex-1">
                  <Field id={`${id}-move`} label="Move to table">
                    <select id={`${id}-move`} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} required className={inputClass}>
                      <option value="">Choose a free table</option>
                      {floor.areas.map((a) => (
                        <optgroup key={a.id} label={a.name}>
                          {freeTables
                            .filter((t) => t.areaId === a.id)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label} · {t.seats} seats{t.reservedTime ? ` · reserved ${t.reservedTime}` : ""}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                </div>
                <Button type="submit" disabled={pending || !moveTo}>Move</Button>
              </form>

              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => changeServerAction(order.id, serverId));
                }}
              >
                <div className="min-w-0 flex-1">
                  <Field id={`${id}-server`} label="Server">
                    <select id={`${id}-server`} value={serverId} onChange={(e) => setServerId(e.target.value)} className={inputClass}>
                      {servers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Button type="submit" disabled={pending || serverId === order.staffId}>Change server</Button>
              </form>
            </>
          ) : (
            <>
              <Link href={branchPath(`/order?table=${table.id}`)} className={`${linkClass} w-full bg-amber text-amber-ink hover:bg-[#f5b552]`}>
                {table.reservedTime ? "Seat guests and start an order" : "Start an order"}
              </Link>
              <form
                className="space-y-3 rounded-xl border border-ink-700 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => reserveTableAction(table.id, time, name));
                }}
              >
                <p className="font-semibold">{table.reservedTime ? `Reserved at ${table.reservedTime}${table.reservedName ? ` · ${table.reservedName}` : ""}` : "Reserve this table"}</p>
                <div className="grid grid-cols-[8rem_1fr] gap-2">
                  <Field id={`${id}-time`} label="Time">
                    <input id={`${id}-time`} type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
                  </Field>
                  <Field id={`${id}-name`} label="Name (optional)">
                    <input id={`${id}-name`} maxLength={RESERVED_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mensah, 4" className={inputClass} />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={pending}>{table.reservedTime ? "Change reservation" : "Reserve"}</Button>
                  {table.reservedTime ? (
                    <Button variant="danger" disabled={pending} onClick={() => act(() => clearReservationAction(table.id))}>
                      Clear reservation
                    </Button>
                  ) : null}
                </div>
              </form>
            </>
          )}
          <FormError error={error} />
        </div>
      ) : null}
    </Dialog>
  );
}

/** Add or edit a table (arrange mode). */
function TableEditor({
  table,
  areas,
  defaultAreaId,
  onClose,
}: {
  table: FloorTable | null;
  areas: Floor["areas"];
  defaultAreaId: string;
  onClose: () => void;
}) {
  const id = useId();
  const [label, setLabel] = useState(table?.label ?? "");
  const [seats, setSeats] = useState(String(table?.seats ?? 4));
  const [shape, setShape] = useState<TableShape>(table?.shape ?? "square");
  const [areaId, setAreaId] = useState(table?.areaId ?? defaultAreaId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<Result>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) onClose();
      else setError(result.error);
    });

  return (
    <Dialog open title={table ? `Edit ${table.label}` : "Add a table"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const input = { label, seats: Number(seats), shape, areaId };
          run(() => (table ? updateTableAction(table.id, input) : addTableAction(input)));
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field id={`${id}-label`} label="Name or number">
            <input id={`${id}-label`} required maxLength={TABLE_LABEL_MAX} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. T13" className={inputClass} />
          </Field>
          <Field id={`${id}-seats`} label="Seats">
            <input id={`${id}-seats`} type="number" inputMode="numeric" min={1} max={MAX_SEATS} required value={seats} onChange={(e) => setSeats(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm text-cream-muted">Shape</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {TABLE_SHAPES.map((s) => (
              <label key={s} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 ${shape === s ? "border-amber bg-amber-soft" : "border-ink-600"}`}>
                <input type="radio" name="shape" value={s} checked={shape === s} onChange={() => setShape(s)} className="size-5 accent-amber" />
                {SHAPE_LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field id={`${id}-area`} label="Area">
          <select id={`${id}-area`} value={areaId} onChange={(e) => setAreaId(e.target.value)} className={inputClass}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <FormError error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          {table ? (
            <Button variant="danger" className="mr-auto" disabled={pending} onClick={() => window.confirm(`Remove ${table.label}?`) && run(() => deleteTableAction(table.id))}>
              Remove table
            </Button>
          ) : null}
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {table ? "Save" : "Add table"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function AreaEditor({ mode, area, onClose, onAdded }: { mode: "add" | "rename"; area?: { id: string; name: string }; onClose: () => void; onAdded: () => void }) {
  const id = useId();
  const [name, setName] = useState(area?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open title={mode === "add" ? "Add an area" : `Rename ${area?.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = mode === "add" ? await addAreaAction(name) : await renameAreaAction(area!.id, name);
            if (!result.ok) return setError(result.error);
            if (mode === "add") onAdded();
            onClose();
          });
        }}
      >
        <Field id={`${id}-name`} label="Area name" hint="For example Garden, Upstairs or VIP room.">
          <input id={`${id}-name`} required maxLength={AREA_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {mode === "add" ? "Add area" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
