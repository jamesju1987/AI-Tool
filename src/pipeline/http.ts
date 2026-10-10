import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { env } from "@/lib/env";

/**
 * Outbound HTTP for crawling third-party sites. URLs come from untrusted sources,
 * so every hop is checked against private / link-local / metadata ranges (SSRF),
 * responses are size-capped, robots.txt is honoured and each host is rate-limited.
 */

export class FetchBlockedError extends Error {}

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local incl. cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchBlockedError(`blocked protocol ${u.protocol}`);
  // Test-only escape hatch (fixture servers on 127.0.0.1). Ignored in production.
  if (process.env.ALLOW_PRIVATE_FETCH === "true" && process.env.NODE_ENV !== "production") return u;
  if (u.username || u.password) throw new FetchBlockedError("credentials in URL");
  if (u.port && !["80", "443", ""].includes(u.port)) throw new FetchBlockedError(`blocked port ${u.port}`);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new FetchBlockedError(`blocked host ${host}`);
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const a of addrs) if (isPrivateIp(a.address)) throw new FetchBlockedError(`blocked private address for ${host}`);
  return u;
}

// --- per-host politeness -------------------------------------------------
const lastHit = new Map<string, number>();
async function politeWait(host: string, minGapMs: number) {
  const prev = lastHit.get(host) ?? 0;
  const wait = prev + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

// --- robots.txt (simple, User-agent: * group only) -------------------------
const robotsCache = new Map<string, { at: number; disallow: string[]; allow: string[] }>();
export function parseRobots(txt: string) {
  const disallow: string[] = [];
  const allow: string[] = [];
  let applies = false;
  let sawRule = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.replace(/#.*/, "").trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, k, v] = m;
    const key = k.toLowerCase();
    if (key === "user-agent") {
      if (sawRule) { applies = false; sawRule = false; }
      if (v.trim() === "*" || /aitoolboxbot/i.test(v)) applies = true;
    } else if (key === "disallow" || key === "allow") {
      sawRule = true;
      if (applies && v.trim()) (key === "disallow" ? disallow : allow).push(v.trim());
    }
  }
  return { disallow, allow };
}

export function robotsAllows(rules: { disallow: string[]; allow: string[] }, path: string) {
  const match = (p: string) => path.startsWith(p.replace(/\*.*$/, ""));
  const d = rules.disallow.filter(match).sort((a, b) => b.length - a.length)[0];
  const a = rules.allow.filter(match).sort((x, y) => y.length - x.length)[0];
  if (!d) return true;
  return !!a && a.length >= d.length;
}

async function checkRobots(u: URL): Promise<boolean> {
  const key = u.origin;
  let rules = robotsCache.get(key);
  if (!rules || Date.now() - rules.at > 24 * 3600_000) {
    try {
      const res = await rawFetch(`${u.origin}/robots.txt`, 8000);
      rules = { at: Date.now(), ...(res.status === 200 ? parseRobots(res.text.slice(0, 200_000)) : { disallow: [], allow: [] }) };
    } catch {
      rules = { at: Date.now(), disallow: [], allow: [] };
    }
    robotsCache.set(key, rules);
  }
  return robotsAllows(rules, u.pathname || "/");
}

type RawResult = { status: number; finalUrl: string; text: string; contentType: string; bytes?: Buffer };

async function rawFetch(url: string, timeoutMs: number, binary = false): Promise<RawResult> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": env.fetchUserAgent, accept: binary ? "image/*,*/*;q=0.5" : "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "en,zh-CN;q=0.8" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      await res.body?.cancel();
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); break; }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks);
    return { status: res.status, finalUrl: current, text: binary ? "" : buf.toString("utf8"), contentType: res.headers.get("content-type") ?? "", bytes: binary ? buf : undefined };
  }
  throw new Error("too many redirects");
}

export type FetchOptions = { timeoutMs?: number; minGapMs?: number; ignoreRobots?: boolean; binary?: boolean };

/** Polite, SSRF-safe GET. Throws FetchBlockedError when robots.txt or the address policy forbids it. */
export async function safeFetch(url: string, opts: FetchOptions = {}): Promise<RawResult> {
  const u = await assertPublicUrl(url);
  await politeWait(u.host, opts.minGapMs ?? 1500);
  if (!opts.ignoreRobots && !(await checkRobots(u))) throw new FetchBlockedError(`robots.txt disallows ${u.pathname}`);
  return rawFetch(url, opts.timeoutMs ?? 15000, opts.binary);
}

/** For APIs we call on purpose (GitHub, Product Hunt…): no robots check, but still SSRF-safe. */
export async function apiFetch(url: string, init: RequestInit = {}, timeoutMs = 20000) {
  await assertPublicUrl(url);
  return fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
}

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
