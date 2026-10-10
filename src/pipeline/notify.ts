import { env } from "@/lib/env";

/** Send a plain-text message to Feishu/Lark, WeCom (企业微信), DingTalk or Slack-compatible webhooks. */
export async function notify(text: string) {
  if (!env.notifyWebhook) return false;
  const host = new URL(env.notifyWebhook).hostname;
  const body = /feishu|larksuite/.test(host)
    ? { msg_type: "text", content: { text } }
    : /qyapi\.weixin\.qq\.com/.test(host)
      ? { msgtype: "text", text: { content: text } }
      : /dingtalk/.test(host)
        ? { msgtype: "text", text: { content: text } }
        : { text };
  try {
    const res = await fetch(env.notifyWebhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    return res.ok;
  } catch {
    return false;
  }
}
