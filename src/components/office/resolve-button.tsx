"use client";

import { useState, useTransition } from "react";
import { resolveConflictAction } from "@/app/b/[branch]/office/actions";
import { Button } from "@/components/admin/ui";

export function ResolveButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resolveConflictAction(id);
            setError(result.ok ? null : result.error);
          })
        }
      >
        Mark as dealt with
      </Button>
      {error ? <p role="alert" className="mt-1 text-sm text-alert">{error}</p> : null}
    </div>
  );
}
