import { addUrls } from "../../actions";
import { ActionForm, SubmitButton } from "../../components";
import { Section, textarea } from "../ui";

export default function AddPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <Section title="批量添加网址">
        <p className="mb-3 text-sm text-muted">
          每行一个网址（最多 500 个）。系统会抓取官网、用 AI 整理中英文信息、去重并打分，然后放进审核队列。用来导入冷启动的种子数据，或处理开发者自荐。
        </p>
        <ActionForm action={addUrls}>
          <textarea name="urls" rows={12} placeholder={"https://example-ai.com\nhttps://another-tool.ai"} className={`${textarea} font-mono`} required />
          <div className="mt-3"><SubmitButton>加入处理队列</SubmitButton></div>
        </ActionForm>
      </Section>
    </div>
  );
}
