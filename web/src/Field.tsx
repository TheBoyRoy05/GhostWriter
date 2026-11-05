import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export const errorIdOf = (id: string) => `${id}-error`;

export default function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
      </Label>
      {children}
      {error && (
        <p id={errorIdOf(id)} className="text-sm text-fault">
          {error}
        </p>
      )}
    </div>
  );
}
