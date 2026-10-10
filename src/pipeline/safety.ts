import { env } from "@/lib/env";
import { apiFetch } from "./http";

/**
 * Google Safe Browsing v4 lookup. Returns the set of URLs flagged as malware/phishing.
 * No key configured → nothing is flagged (admins can still block domains manually).
 */
export async function checkUrls(urls: string[]): Promise<Map<string, string>> {
  const flagged = new Map<string, string>();
  if (!env.safeBrowsingKey || !urls.length) return flagged;
  for (let i = 0; i < urls.length; i += 400) {
    const batch = urls.slice(i, i + 400);
    const res = await apiFetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${env.safeBrowsingKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "ai-toolbox", clientVersion: "1.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: batch.map((url) => ({ url })),
        },
      }),
    });
    if (!res.ok) throw new Error(`Safe Browsing HTTP ${res.status}`);
    const data = (await res.json()) as { matches?: { threat: { url: string }; threatType: string }[] };
    for (const m of data.matches ?? []) flagged.set(m.threat.url, m.threatType);
  }
  return flagged;
}
