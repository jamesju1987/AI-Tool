# AI 工具箱 · 自动更新的 AI 工具导航

中英双语 AI 工具导航站：每天自动发现、整理、核验新工具，运营者只需在后台审核。
对应 PRD《AI工具箱自动更新网站》P0 范围（第一期 MVP）。

- 英文站在根路径 `/`，中文站在 `/zh`，同一套数据与流水线
- 采集 → AI 抽取（中英双语卡片）→ 去重 → Jev 打分 → 自动上架或进人工审核 → 定期巡检 → 下线
- 分类内用 Jev 两两比较排序，与站内点击、外部热度、新鲜度合成综合分
- 部署在海外服务器（免 ICP 备案），一台 VPS + Docker Compose 即可运行

---

## 功能清单

| 模块 | 已实现（P0） |
| --- | --- |
| 前台 | 首页（搜索、新收录、本周热门、分类卡片墙）、分类页（二级 Tab、定价/国内访问/平台/开源/中文界面筛选、综合/最新/热度排序）、工具详情页、替代品页、最新收录、榜单、中国 AI 专区、全部分类、站内搜索（支持拼音和拼音首字母）、排序说明页 |
| SEO | 每页 canonical + hreflang（en / zh-CN / x-default）、sitemap.xml（含双语互指）、robots.txt、详情页 SoftwareApplication 与榜单 ItemList 结构化数据 |
| 外链 | 统一经 `/go/{slug}` 跳转：统计点击、过滤爬虫、拦截已下线工具与被 Safe Browsing 或黑名单标记的域名 |
| 自动更新 | 数据源插件（Product Hunt、GitHub、Hugging Face、RSS/Atom、网页列表、人工添加）、官网抓取（含定价页）、AI 抽取、去重、Jev 入库打分、审核分流、巡检与自动下线、Logo/预览图本地化、热度与综合分、Jev 两两排序、每日审核提醒、数据清理 |
| 后台 | 账号密码 + TOTP 二次验证、登录限速、可选 IP 白名单、审核队列（快捷键）、工具管理（编辑/上下架/置顶/合并并 301）、分类管理（增改/排序/批量迁移）、数据源管理（启停/配置/产出量与通过率/立即采集）、任务日志（查看日志/重跑）、设置（阈值、权重、黑名单）、审计日志、批量添加网址 |
| 运维 | Docker Compose（Postgres、web、worker、Caddy 自动 HTTPS、每日备份保留 30 天）、GitHub Actions CI |

未在本期实现（PRD 中的 P1/P2）：企业选型专区与安全标签、AI 快讯、用户纠错与开发者投稿表单（后台“添加网址”可代替）、收藏订阅、广告位管理、官网截图（目前用网站自带的 og:image 作预览图）。

---

## 架构

```
             ┌────────────── Caddy（HTTPS、缓存头）──────────────┐
             │                                                   │
 访客 ──▶  web：Next.js 16（前台 + /admin 后台 + /go 跳转）   ◀─ /api/revalidate ─┐
             │                                                   │               │
             └──────────────▶  PostgreSQL 16  ◀──────────────  worker（定时任务）
                                 （pg_trgm 搜索）                 ├─ 数据源插件
                                                                 ├─ 抓取官网（SSRF 防护、robots.txt、限速）
                                                                 ├─ OpenRouter：LLM 抽取 + Jev 判断
                                                                 └─ 写入 media 卷（Logo/预览图）
```

- **web**：页面在请求时读数据库，进程内缓存 2 分钟；worker 发布新内容后调用 `/api/revalidate` 立即清缓存。`next build` 不需要数据库。
- **worker**：cron 只负责把任务放进队列（`job_runs` 表），一个循环按顺序执行，所以慢任务不会叠在一起；后台“立即运行”走同一个队列。
- **AI**：Jev（排序与打分）和大模型（双语抽取）分别配置，缺哪个就用对应的降级方案；都没有时进入离线模式，所有条目进入人工审核——本地开发和测试不需要任何密钥。

### 每日节奏（`TZ_SCHEDULE`，默认 Asia/Shanghai）

| 时间 | 任务 |
| --- | --- |
| 02:00 / 08:00 / 14:00 / 20:00 | 采集各数据源 |
| 每次采集后 20 分钟 | AI 抽取、去重、打分、分流 |
| 每次采集后 50 分钟 | 下载 Logo 与预览图 |
| 每天 03:00 | 巡检到期的工具（每周一次，热门工具每 3 天）+ Safe Browsing |
| 每天 05:00 | 计算热度与综合分 |
| 每天 07:00 | 推送“今日待审核”到飞书 / 企业微信 / 钉钉 |
| 每周一 01:00 | Jev 两两排序 |
| 每周日 04:30 | 清理过期日志与快照 |

### 排序：Jev

- **入库打分**（每个新工具一次请求）：是否为可用的 AI 工具、简介是否中立、分类是否匹配、页面是否含针对 AI 的指令（注入信号，只作过滤参考）、成熟度 1–5。
- **两两比较**（每周）：每个分类内按“有用（权重 2）/ 易上手 / 访问与付费方便”三个问题比较，每对正反两个顺序各问一次以抵消位置偏差，用 Bradley–Terry 合成排名；中英文站按各自受众分别排序；前两名差距过小时标注“难分高下”。
- **综合分** = AI 评审 × w1 + 站内行为 × w2 + 外部信号 × w3 + 新鲜度 × w4，权重在后台“设置”中调整（冷启动 0.6/0.1/0.2/0.1）。
- 每次判断都记录在 `jev_judgments` 表，便于复核与申诉。
- Jev 有两种接入方式：Jev 官方 key（`TYPESAFE_API_KEY`，直连 `api.typesafe.ai/v1/systemone`，模型 `jev-latest`），或 OpenRouter（`OPENROUTER_API_KEY`，模型 `typesafe/jev-1.13`）；两者都配置时优先用官方 key。用 `npm run ai:check` 检查密钥。OpenRouter 返回 404 “No allowed providers” 时，需要在其隐私设置里允许 TypeSafe 提供方。Jev 不可用时自动退回到大模型评审；连大模型也没有时用离线规则，条目全部进人工审核。
- 抽取用的大模型可以是任何 OpenAI 兼容接口：默认走 OpenRouter，也可以设 `LLM_BASE_URL` + `LLM_API_KEY` 直连 DeepSeek 等。

---

## 在自己电脑上看效果（Docker Desktop）

装好 [Docker Desktop](https://www.docker.com/products/docker-desktop/) 后，在项目目录运行：

```bash
docker compose -f docker-compose.local.yml up -d --build   # 首次约 5–10 分钟
```

然后打开 <http://localhost:3000/zh>（中文）或 <http://localhost:3000>（英文）。创建后台账号（用验证器 App 扫码），再打开 <http://localhost:3000/admin>：

```bash
docker compose -f docker-compose.local.yml exec web npx tsx src/scripts/create-admin.ts james
```

- 构建时默认使用 npmmirror 镜像下载依赖；不需要时设 `NPM_REGISTRY=https://registry.npmjs.org`。如果拉取 `node`、`postgres` 镜像很慢，请在 Docker Desktop → Settings → Docker Engine 里配置镜像加速。
- 想试 Jev 和大模型：在项目目录建一个 `.env`，写入 `TYPESAFE_API_KEY=...`（或 `OPENROUTER_API_KEY=...`），然后 `docker compose -f docker-compose.local.yml up -d` 重启，再用 `docker compose -f docker-compose.local.yml exec web npm run ai:check` 检查密钥是否可用。注意：在中国大陆网络下这些海外接口可能连不上。
- 停止：`docker compose -f docker-compose.local.yml down`（加 `-v` 会同时删除数据）。

## 本地开发

需要 Node.js 22 和 PostgreSQL 16。

```bash
npm ci
cp .env.example .env            # 本地只需 DATABASE_URL 和 REVALIDATE_SECRET
createdb aitoolbox
npm run db:migrate              # 建表 + pg_trgm 索引
npm run db:seed                 # 60 个分类、39 个示例工具、默认数据源
npm run admin:create -- james   # 创建后台账号，用验证器 App 扫码
npm run dev                     # http://localhost:3000 （中文 /zh，后台 /admin）
npm run worker                  # 另开终端：定时任务
```

手动运行任一任务：

```bash
npm run job -- collect                      # 采集全部启用的数据源
npm run job -- collect source=github        # 只采集一个数据源
npm run job -- process limit=20             # 处理待处理条目
npm run job -- add https://a.ai https://b.ai && npm run job -- process
npm run job -- rank category=video-generation locale=zh
npm run job -- patrol toolId=12
```

测试：

```bash
npm test          # 单元测试 + 端到端测试（自动创建 aitoolbox_test 库，用本地假网站跑完整流水线）
npm run lint && npm run typecheck
```

---

## 部署到海外服务器

1. 准备一台海外 VPS（建议香港 / 新加坡 / 日本，带国内优化线路；2 核 4 GB 起步），安装 Docker。
2. 域名的 A 记录指向服务器 IP。
3. 在服务器上：

```bash
git clone <repo> aitoolbox && cd aitoolbox
cp .env.example .env
# 必填：DOMAIN、SITE_URL、POSTGRES_PASSWORD、REVALIDATE_SECRET
# 建议：OPENROUTER_API_KEY、PRODUCTHUNT_TOKEN、GITHUB_TOKEN、SAFE_BROWSING_API_KEY、NOTIFY_WEBHOOK_URL、ADMIN_IP_ALLOWLIST
docker compose build
docker compose up -d db
docker compose --profile tools run --rm migrate     # 建表并写入分类与示例数据
docker compose run --rm -it web npx tsx src/scripts/create-admin.ts <用户名>
docker compose up -d
```

Caddy 会自动申请 HTTPS 证书。升级：`git pull && docker compose build && docker compose --profile tools run --rm migrate && docker compose up -d`。

备份：`./backups` 目录每天一份 `pg_dump`，保留 30 天；请定期复制到服务器之外，每季度做一次恢复演练：
`gunzip -c backups/aitoolbox-YYYYMMDD.sql.gz | docker compose exec -T db psql -U aitoolbox aitoolbox`

### 上线前检查

- [ ] 示例工具的定价与“国内访问”标签已人工核对（种子数据是手写的示例）
- [ ] 在“添加网址”批量导入种子工具（PRD 目标 800 条），审核上架
- [ ] 前 4 周保持“自动上架”关闭，用审核结果校准阈值
- [ ] `ADMIN_IP_ALLOWLIST` 已设置，或后台只经 VPN 访问
- [ ] 配置 `NOTIFY_WEBHOOK_URL`，确认 07:00 能收到提醒、任务失败能收到告警
- [ ] 国内多地测速（首屏目标 < 1.5 秒），准备好备用域名

---

## 安全设计

- **抓取**：外部网址逐跳校验，拒绝内网、回环、云元数据地址和非 80/443 端口（SSRF）；遵守 robots.txt；每个站点限速；响应大小上限 2 MB；图片按文件头识别类型，SVG 以沙箱方式返回。
- **提示词注入**：抓到的网页文本只放在 `<untrusted_data>` 数据块里交给模型，输出必须通过 zod 校验；Jev 额外判断页面是否含针对 AI 的指令，命中则进人工。
- **后台**：bcrypt 密码 + TOTP（同一验证码不能重放）、按 IP 和账号限速、会话令牌只存哈希、Cookie 为 httpOnly + SameSite=Strict、可选 IP 白名单、所有操作写审计日志、每个 server action 都重新校验登录。
- **外链**：`/go` 跳转前检查 Safe Browsing 结果和后台黑名单；数据库不对公网开放；全站 HTTPS 与安全响应头。

---

## 与 PRD 的差异

| PRD | 实现 | 原因 |
| --- | --- | --- |
| Worker 用 Python + Playwright | 全部 TypeScript（同一代码库），HTTP 抓取 + cheerio 解析 | 一个人维护一种语言、一套依赖；绝大多数官网无需浏览器渲染 |
| 官网截图 | 使用网站的 og:image 作为预览图 | 省去无头浏览器；需要截图时可再加一个 Playwright 任务 |
| Meilisearch 搜索 | PostgreSQL pg_trgm + 拼音索引 | 少一个服务；当前规模足够，量大后可换 |
| pgvector 去重 | 可选向量（配置 `EMBEDDING_MODEL`）+ 名称三元组相似度 | 不强依赖向量扩展和嵌入模型 |
| “根域名一致就合并” | 按“主机名”判定，github.com、huggingface.co 等共享域名再加路径 | 避免把同一根域下不同产品（如 jimeng.jianying.com）或不同 GitHub 项目误合并 |
| pairsort（Python 库） | 在 worker 里实现同样的方法（双向提问 + Bradley–Terry + 多问题加权） | 无需额外的 Python 运行时 |

---

## 目录

```
src/
  app/(site)/[locale]/   前台页面（en 在根路径，zh 在 /zh）
  app/(admin)/admin/     后台（登录、审核队列、工具、分类、数据源、任务、设置、审计）
  app/go | api | media   外链跳转、浏览统计与缓存刷新、本地图片
  db/                    表结构（Drizzle）、分类与示例数据
  lib/                   配置、i18n、查询、鉴权、设置
  pipeline/              抓取、抽取、Jev、去重、发布、两两排序、定时任务、worker
  scripts/               迁移、种子数据、创建管理员、手动运行任务
tests/unit | tests/e2e   单元测试与端到端测试（含假网站）
drizzle/                 SQL 迁移
deploy/Caddyfile         反向代理与 HTTPS
```
