import "dotenv/config";
import { z } from "zod";
import { env } from "@/lib/env";
import { JevJudge, jevEndpoint, jevUsage } from "@/pipeline/jev";
import { chatJson, llmUsage } from "@/pipeline/llm";

/**
 * Verify the model keys in .env with two tiny requests (costs a fraction of a cent):
 *   npm run ai:check
 * Exits non-zero if a configured model doesn't answer.
 */
const ok = (s: string) => console.log(`  ✓ ${s}`);
const bad = (s: string) => console.log(`  ✗ ${s}`);

async function checkJev() {
  console.log("\nJev（排序与打分）");
  if (!env.jevEnabled) {
    bad("未配置：在 .env 填 TYPESAFE_API_KEY（Jev 官方 key）或 OPENROUTER_API_KEY");
    return true; // optional
  }
  const ep = jevEndpoint();
  console.log(`  通道 ${ep.provider} → ${ep.url}，模型 ${env.jevModel}`);
  const t0 = Date.now();
  try {
    const ans = await new JevJudge().decide(
      { items: { T1: "Cursor: AI code editor", T2: "A recipe blog about bread" } },
      {
        larger: { instructions: "Which number is larger?", criteria: { A: "2", B: "3" } },
        tool: { instructions: "Which item is an AI tool?", criteria: { A: "items.T1", B: "items.T2" } },
      },
    );
    const p1 = ans.larger.B, p2 = ans.tool.A;
    ok(`响应 ${Date.now() - t0} ms，费用 $${jevUsage.costUsd.toFixed(6)}`);
    console.log(`  “3 比 2 大”的概率 ${p1.toFixed(3)}，“Cursor 是 AI 工具”的概率 ${p2.toFixed(3)}`);
    if (p1 < 0.6 || p2 < 0.6) {
      bad("回答不符合常识，请检查 JEV_MODEL 是否正确");
      return false;
    }
    ok("Jev 可用");
    return true;
  } catch (e) {
    const msg = (e as Error).message;
    bad(msg);
    if (/HTTP 40[13]/.test(msg)) console.log("  → key 无效或无权限：确认 key 复制完整、对应正确的通道（官方 key 用 TYPESAFE_API_KEY）");
    if (/HTTP 404/.test(msg) && ep.provider === "openrouter") console.log("  → 在 OpenRouter 设置 → Privacy 中允许 TypeSafe 提供方，或改用 TYPESAFE_API_KEY 直连");
    if (/HTTP 404/.test(msg) && ep.provider === "typesafe") console.log("  → 检查 TYPESAFE_BASE_URL 和 JEV_MODEL（官方默认 jev-latest）");
    if (/fetch failed|ENOTFOUND|ECONN|timeout/i.test(msg)) console.log("  → 网络不通：这台机器无法访问该地址（国内网络请在海外服务器上运行）");
    return false;
  }
}

async function checkLlm() {
  console.log("\n大模型（中英文信息抽取）");
  if (!env.llmEnabled) {
    bad("未配置：抽取会用规则代替，所有新工具进人工审核。填 OPENROUTER_API_KEY，或 LLM_BASE_URL + LLM_API_KEY（如 DeepSeek）");
    return true;
  }
  console.log(`  ${env.llmBase}，模型 ${env.llmModel}`);
  const t0 = Date.now();
  try {
    const r = await chatJson({
      system: "You return compact JSON.",
      instructions: 'Return {"zh": "<the Chinese translation of the word>", "en": "<the word>"}.',
      data: "translate",
      schema: z.object({ zh: z.string(), en: z.string() }),
      maxTokens: 50,
    });
    ok(`响应 ${Date.now() - t0} ms：${JSON.stringify(r)}（tokens ${llmUsage.inputTokens}+${llmUsage.outputTokens}）`);
    return true;
  } catch (e) {
    bad((e as Error).message);
    return false;
  }
}

(async () => {
  const a = await checkJev();
  const b = await checkLlm();
  const none = !env.jevEnabled && !env.llmEnabled;
  console.log(!(a && b) ? "\n有检查未通过，见上方提示。" : none ? "\n未配置任何模型密钥：网站可正常运行，流水线为离线模式。" : "\n已配置的模型全部正常。");
  process.exitCode = a && b ? 0 : 1;
})();
