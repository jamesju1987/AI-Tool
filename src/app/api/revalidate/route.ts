import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clearMemo } from "@/lib/cache";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Called by the worker after it publishes or changes tools. */
export async function POST(req: NextRequest) {
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  const want = Buffer.from(env.revalidateSecret);
  if (!want.length || given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  clearMemo();
  return NextResponse.json({ ok: true });
}
