"use client";

import { startTransition, useActionState } from "react";
import { loginAction } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const field = "mt-1 block h-10 w-full rounded-md border border-line bg-surface px-3";
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => action(fd));
        }}
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-6">
        <h1 className="font-display text-xl font-semibold">运营后台登录</h1>
        <label className="mt-5 block text-sm">
          用户名
          <input name="username" autoComplete="username" required className={field} />
        </label>
        <label className="mt-3 block text-sm">
          密码
          <input name="password" type="password" autoComplete="current-password" required className={field} />
        </label>
        <label className="mt-3 block text-sm">
          验证器 6 位码
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required className={field} />
        </label>
        {state?.error && <p role="alert" className="mt-3 text-sm text-danger">{state.error}</p>}
        <button disabled={pending} className="mt-5 h-10 w-full rounded-md bg-ink font-medium text-canvas disabled:opacity-60">
          {pending ? "登录中…" : "登录"}
        </button>
        <p className="mt-4 text-xs text-muted">账号用 <code>npm run admin:create -- 用户名</code> 创建。</p>
      </form>
    </main>
  );
}
