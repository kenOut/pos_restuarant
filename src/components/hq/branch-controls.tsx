"use client";

import { useActionState, useId, useState } from "react";
import { renameBranchAction, setBranchActiveAction, type HqFormState } from "@/app/hq/actions";
import { Button, Dialog, Field, FormError, inputClass } from "@/components/admin/ui";

/** Rename and close/reopen buttons for one branch on the head office dashboard. */
export function BranchControls({ branch }: { branch: { id: string; name: string; active: boolean } }) {
  const id = useId();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(branch.name);
  const [confirmClose, setConfirmClose] = useState(false);

  const [renameState, renameAction, renamePending] = useActionState<HqFormState | { saved: true }, FormData>(async (_, data) => {
    // A new object each time, so a second rename is noticed too.
    return (await renameBranchAction(null, data)) ?? { saved: true };
  }, null);
  const [activeState, activeAction, activePending] = useActionState<HqFormState, FormData>(setBranchActiveAction, null);

  // Dialogs close once their request has finished: rename only if it worked, close-branch
  // either way (an error shows under the buttons). Adjusted during render, not in an effect.
  const [seen, setSeen] = useState({ renameState, activePending });
  if (seen.renameState !== renameState || seen.activePending !== activePending) {
    if (renameState !== seen.renameState && renameState && "saved" in renameState) setRenaming(false);
    if (seen.activePending && !activePending) setConfirmClose(false);
    setSeen({ renameState, activePending });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => { setName(branch.name); setRenaming(true); }}>Rename</Button>
      {branch.active ? (
        <Button variant="danger" onClick={() => setConfirmClose(true)}>Close branch</Button>
      ) : (
        <form action={activeAction}>
          <input type="hidden" name="branchId" value={branch.id} />
          <input type="hidden" name="active" value="1" />
          <Button type="submit" disabled={activePending}>Reopen</Button>
        </form>
      )}
      {activeState?.error && !confirmClose ? <p role="alert" className="w-full text-sm text-alert">{activeState.error}</p> : null}

      <Dialog open={renaming} title={`Rename ${branch.name}`} onClose={() => setRenaming(false)}>
        <form action={renameAction} className="space-y-4">
          <input type="hidden" name="branchId" value={branch.id} />
          <Field id={`${id}-name`} label="Branch name" hint="Shown at the branch and on its receipts. Its address stays the same.">
            <input id={`${id}-name`} name="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <FormError error={renameState && "error" in renameState ? renameState.error : null} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setRenaming(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={renamePending}>Save</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={confirmClose} title={`Close ${branch.name}?`} onClose={() => setConfirmClose(false)}>
        <form action={activeAction} className="space-y-4">
          <input type="hidden" name="branchId" value={branch.id} />
          <input type="hidden" name="active" value="0" />
          <p className="text-cream-muted">
            Nobody can open its tills until you reopen it. Its data, menu and backups are kept.
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmClose(false)}>Keep open</Button>
            <Button type="submit" variant="danger" disabled={activePending}>Close branch</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
