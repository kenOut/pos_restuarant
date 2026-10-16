"use client";

import { useId, useState, useTransition } from "react";
import {
  createCategoryAction,
  createItemAction,
  deleteCategoryAction,
  moveCategoryAction,
  moveItemAction,
  removeItemAction,
  renameCategoryAction,
  restoreItemAction,
  setAvailableAction,
  updateItemAction,
} from "@/app/(till)/menu/actions";
import { Button, Dialog, Field, FormError, IconButton, PageHeader, inputClass } from "@/components/admin/ui";
import { STATIONS, type Station } from "@/db/enums";
import type { AdminCategory, AdminItem } from "@/lib/menu/service";
import { parseCedis } from "@/lib/payments/bill";
import { formatAmount, formatCedis } from "@/lib/money";

type Props = { categories: AdminCategory[]; items: AdminItem[] };
type ItemForm = { id: string | null; name: string; category: string; station: Station; price: string };

export function MenuManager({ categories, items }: Props) {
  const id = useId();
  const [selected, setSelected] = useState<string | null>(categories[0]?.name ?? null);
  const [newCategory, setNewCategory] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState<ItemForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const category = categories.find((c) => c.name === selected) ?? categories[0] ?? null;
  const dishes = items.filter((i) => !i.archived && i.category === category?.name);
  const archived = items.filter((i) => i.archived);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, after?: () => void, message?: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setNotice(null);
        return;
      }
      setError(null);
      setNotice(message ?? null);
      after?.();
    });

  const saveItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    const price = parseCedis(form.price);
    if (price === null) return setError("Enter the price, e.g. 45.00");
    const input = { name: form.name, category: form.category, station: form.station, price };
    run(() => (form.id ? updateItemAction(form.id, input) : createItemAction(input)), () => setForm(null), form.id ? "Dish saved." : `${form.name.trim()} added.`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Menu"
        description="Changes show on every till straight away. Orders already taken keep the names and prices they were sold at."
        actions={
          <Button
            variant="primary"
            disabled={!category}
            onClick={() => {
              setError(null);
              setForm({ id: null, name: "", category: category?.name ?? "", station: "Kitchen", price: "" });
            }}
          >
            + Add dish
          </Button>
        }
      />
      <div className="px-3 pt-2 sm:px-4" aria-live="polite">
        {!form ? <FormError error={error} /> : null}
        {notice ? <p className="text-sm text-eating-text">{notice}</p> : null}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 sm:p-4 md:grid-cols-[17rem_1fr] md:overflow-hidden">
        {/* Categories */}
        <section aria-labelledby={`${id}-cats`} className="flex flex-col gap-3 md:min-h-0 md:overflow-y-auto">
          <h2 id={`${id}-cats`} className="text-sm font-semibold text-cream-muted">
            Categories
          </h2>
          <ul className="space-y-1.5">
            {categories.map((c, i) => {
              const active = c.name === category?.name;
              return (
                <li key={c.id} className={`flex items-center gap-1 rounded-xl border p-1 ${active ? "border-amber bg-amber-soft" : "border-ink-700 bg-ink-850"}`}>
                  {renaming?.id === c.id ? (
                    <form
                      className="flex flex-1 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(() => renameCategoryAction(c.id, renaming.name), () => {
                          setSelected(renaming.name.trim());
                          setRenaming(null);
                        });
                      }}
                    >
                      <label htmlFor={`${id}-rename`} className="sr-only">
                        New name for {c.name}
                      </label>
                      <input id={`${id}-rename`} autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: c.id, name: e.target.value })} maxLength={30} className={`${inputClass} mt-0 h-11`} />
                      <IconButton label="Save name" icon="check" type="submit" />
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelected(c.name)}
                        className="flex min-h-11 flex-1 items-center justify-between gap-2 rounded-lg px-3 text-left font-medium"
                      >
                        {c.name}
                        <span className="text-xs text-cream-faint">{c.itemCount}</span>
                      </button>
                      <IconButton label={`Move ${c.name} up`} icon="back" className="[&_svg]:rotate-90" disabled={i === 0 || pending} onClick={() => run(() => moveCategoryAction(c.id, -1))} />
                      <IconButton label={`Move ${c.name} down`} icon="back" className="[&_svg]:-rotate-90" disabled={i === categories.length - 1 || pending} onClick={() => run(() => moveCategoryAction(c.id, 1))} />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {category ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setRenaming({ id: category.id, name: category.name })}>Rename</Button>
              <Button variant="danger" disabled={pending} onClick={() => run(() => deleteCategoryAction(category.id), () => setSelected(null), `${category.name} removed.`)}>
                Remove category
              </Button>
            </div>
          ) : null}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newCategory.trim();
              run(() => createCategoryAction(name), () => {
                setSelected(name);
                setNewCategory("");
              }, `${name} added.`);
            }}
          >
            <div className="flex-1">
              <Field id={`${id}-newcat`} label="New category">
                <input id={`${id}-newcat`} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} maxLength={30} placeholder="e.g. Breakfast" className={inputClass} />
              </Field>
            </div>
            <Button type="submit" disabled={!newCategory.trim() || pending}>
              Add
            </Button>
          </form>
        </section>

        {/* Dishes */}
        <section aria-labelledby={`${id}-dishes`} className="flex flex-col gap-3 md:min-h-0 md:overflow-y-auto">
          <h2 id={`${id}-dishes`} className="text-sm font-semibold text-cream-muted">
            {category ? `${category.name} · ${dishes.length} dish${dishes.length === 1 ? "" : "es"}` : "Add a category to start your menu"}
          </h2>
          {category && dishes.length === 0 ? <p className="rounded-xl border border-dashed border-ink-600 p-6 text-center text-cream-muted">No dishes in {category.name} yet.</p> : null}
          <ul className="space-y-2">
            {dishes.map((item, i) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 p-2 pl-4">
                <div className="min-w-40 flex-1">
                  <p className={`font-semibold ${item.available ? "" : "text-cream-faint line-through"}`}>{item.name}</p>
                  <p className="text-sm text-cream-muted">
                    {formatCedis(item.price)} · {item.station}
                  </p>
                </div>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-ink-700 px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={!item.available}
                    disabled={pending}
                    onChange={(e) => run(() => setAvailableAction(item.id, !e.target.checked), undefined, e.target.checked ? `${item.name} marked sold out.` : `${item.name} back on.`)}
                    className="size-5 accent-alert"
                  />
                  Sold out
                </label>
                <IconButton label={`Move ${item.name} up`} icon="back" className="[&_svg]:rotate-90" disabled={i === 0 || pending} onClick={() => run(() => moveItemAction(item.id, -1))} />
                <IconButton label={`Move ${item.name} down`} icon="back" className="[&_svg]:-rotate-90" disabled={i === dishes.length - 1 || pending} onClick={() => run(() => moveItemAction(item.id, 1))} />
                <Button
                  onClick={() => {
                    setError(null);
                    setForm({ id: item.id, name: item.name, category: item.category, station: item.station, price: formatAmount(item.price).replace(/,/g, "") });
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Take ${item.name} off the menu?`)) return;
                    run(() => removeItemAction(item.id), undefined, `${item.name} taken off the menu.`);
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>

          {archived.length ? (
            <details className="rounded-xl border border-ink-700 p-3">
              <summary className="min-h-11 cursor-pointer content-center font-semibold">Taken off the menu ({archived.length})</summary>
              <p className="text-sm text-cream-muted">Kept because past orders include them.</p>
              <ul className="mt-2 space-y-2">
                {archived.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <span className="flex-1">
                      {item.name} <span className="text-sm text-cream-faint">· {item.category}</span>
                    </span>
                    <Button disabled={pending} onClick={() => run(() => restoreItemAction(item.id), undefined, `${item.name} is back on the menu.`)}>
                      Put back
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </div>

      <Dialog open={form !== null} title={form?.id ? "Edit dish" : "Add dish"} onClose={() => setForm(null)}>
        {form ? (
          <form onSubmit={saveItem} className="space-y-3">
            <Field id={`${id}-name`} label="Name">
              <input id={`${id}-name`} required autoFocus maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={`${id}-price`} label="Price (GH₵)" hint="What the guest pays before any taxes added on top.">
                <input id={`${id}-price`} required inputMode="decimal" placeholder="e.g. 45.00" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputClass} />
              </Field>
              <Field id={`${id}-cat`} label="Category">
                <select id={`${id}-cat`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                  {categories.map((c) => (
                    <option key={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <fieldset>
              <legend className="text-sm text-cream-muted">Made at</legend>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STATIONS.map((s) => (
                  <label key={s} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-medium ${form.station === s ? "border-amber bg-amber-soft" : "border-ink-600"}`}>
                    <input type="radio" name="station" value={s} checked={form.station === s} onChange={() => setForm({ ...form, station: s })} className="sr-only" />
                    {s}
                  </label>
                ))}
              </div>
            </fieldset>
            <FormError error={error} />
            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              {pending ? "Saving…" : form.id ? "Save dish" : "Add dish"}
            </Button>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}
