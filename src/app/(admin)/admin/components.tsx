"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef } from "react";
import type { ActionState } from "./actions";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/** A form bound to a server action that shows the result and refreshes the page on success. */
export function ActionForm({
  action,
  children,
  className,
  id,
  refresh = true,
  confirm,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  id?: string;
  refresh?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && refresh) router.refresh();
  }, [state, refresh, router]);
  return (
    <form
      id={id}
      className={className}
      aria-busy={pending}
      // Submitting manually (instead of action=) keeps the editor's input when the server
      // returns a validation error — React would otherwise reset the form.
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || (confirm && !window.confirm(confirm))) return;
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(fd));
      }}
    >
      {children}
      {(state?.error || state?.message) && (
        <p role="status" className={`mt-2 text-sm ${state.error ? "text-danger" : "text-accent"}`}>
          {state.error ?? state.message}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary", name, value, form }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; name?: string; value?: string; form?: string }) {
  const cls = {
    primary: "bg-ink text-canvas hover:opacity-90",
    secondary: "ring-1 ring-line hover:ring-ink",
    danger: "text-danger ring-1 ring-danger/50 hover:bg-danger hover:text-white",
  }[variant];
  return (
    <button type="submit" name={name} value={value} form={form} className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}

/**
 * Keyboard shortcuts for the review queue:
 * A = approve, R = reject, M = merge (duplicates), N = next task, E = edit first field.
 */
export function ReviewShortcuts({ nextHref }: { nextHref: string | null }) {
  const router = useRouter();
  const nextRef = useRef(nextHref);
  useEffect(() => {
    nextRef.current = nextHref;
  }, [nextHref]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      const submit = (id: string) => (document.getElementById(id) as HTMLFormElement | null)?.requestSubmit();
      switch (e.key.toLowerCase()) {
        case "a": submit("approve-form"); break;
        case "r": submit("reject-form"); break;
        case "m": submit("merge-form"); break;
        case "n": if (nextRef.current) router.push(nextRef.current); break;
        case "e": (document.querySelector("#approve-form input, #approve-form textarea") as HTMLElement | null)?.focus(); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return (
    <p className="text-xs text-muted">
      快捷键：<kbd>A</kbd> 通过　<kbd>R</kbd> 驳回　<kbd>M</kbd> 合并　<kbd>N</kbd> 下一条　<kbd>E</kbd> 编辑
    </p>
  );
}
