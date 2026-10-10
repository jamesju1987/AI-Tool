"use client";

import { useEffect } from "react";

/** Counts a detail-page view once per tab session. Feeds the heat score. */
export function TrackView({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `v:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage unavailable: still count */
    }
    const body = JSON.stringify({ slug });
    if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
      fetch("/api/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  }, [slug]);
  return null;
}
