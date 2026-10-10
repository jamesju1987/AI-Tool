import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, sql as dsql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifySync } from "otplib";
import { db } from "@/db/client";
import { adminSessions, adminUsers, auditLogs, loginAttempts } from "@/db/schema";
import { env } from "./env";

const COOKIE = "atb_admin";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

const WINDOW_MS = 15 * 60_000;
// Compared against when the username doesn't exist, so response time doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString("hex"), 12);
const MAX_FAILS = 5;

async function recentFailures(key: string) {
  const [r] = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), eq(loginAttempts.ok, false), gt(loginAttempts.createdAt, new Date(Date.now() - WINDOW_MS))));
  return r.n;
}

export type LoginResult = { ok: true } | { ok: false; error: string };

/** Password + TOTP, rate-limited per IP and per username. */
export async function login(username: string, password: string, code: string): Promise<LoginResult> {
  const ip = await clientIp();
  const keys = [`ip:${ip}`, `user:${username.toLowerCase()}`];
  for (const k of keys) {
    if ((await recentFailures(k)) >= MAX_FAILS) return { ok: false, error: "尝试次数过多，请 15 分钟后再试。" };
  }
  const fail = async (reason: string) => {
    await db.insert(loginAttempts).values(keys.map((key) => ({ key, ok: false })));
    await audit("login_failed", username, { reason }, username);
    return { ok: false as const, error: "用户名、密码或验证码不正确。" };
  };

  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.username, username));
  const pwOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !pwOk) return fail("password");

  const res = verifySync({ secret: user.totpSecret, token: code.replace(/\s/g, ""), epochTolerance: 30 });
  if (!res.valid || !("timeStep" in res) || res.timeStep <= user.lastTotpStep) return fail("totp");
  await db.update(adminUsers).set({ lastTotpStep: res.timeStep }).where(eq(adminUsers.id, user.id));

  const token = randomBytes(32).toString("base64url");
  await db.insert(adminSessions).values({ id: hash(token), userId: user.id, ip, expiresAt: new Date(Date.now() + env.sessionHours * 3600_000) });
  await db.insert(loginAttempts).values(keys.map((key) => ({ key, ok: true })));
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: env.isProd, sameSite: "strict", path: "/admin", maxAge: env.sessionHours * 3600 });
  await audit("login", username);
  return { ok: true };
}

export async function getAdmin(): Promise<{ id: number; username: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ id: adminUsers.id, username: adminUsers.username })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(and(eq(adminSessions.id, hash(token)), gt(adminSessions.expiresAt, new Date())));
  return row ?? null;
}

/** Use at the top of every admin page and server action. */
export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(adminSessions).where(eq(adminSessions.id, hash(token)));
  jar.delete({ name: COOKIE, path: "/admin" });
}

export async function audit(action: string, target?: string | null, detail: Record<string, unknown> = {}, username?: string) {
  const who = username ?? (await getAdmin())?.username ?? null;
  await db.insert(auditLogs).values({ username: who, action, target: target ?? null, detail, ip: await clientIp() });
}
