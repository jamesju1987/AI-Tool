/** Taxonomy from PRD §4: 16 top-level categories organised by the task a user wants done. */
export type SeedCategory = {
  slug: string;
  zh: string;
  en: string;
  descZh?: string;
  descEn?: string;
  sensitive?: boolean;
  children?: { slug: string; zh: string; en: string }[];
};

export const seedCategories: SeedCategory[] = [
  {
    slug: "chat", zh: "AI 对话助手", en: "AI Chat Assistants",
    descZh: "通用 AI 助手与对话机器人", descEn: "General-purpose assistants and chatbots",
    children: [
      { slug: "chat-general", zh: "通用助手", en: "General assistants" },
      { slug: "chat-character", zh: "角色陪聊", en: "Character chat" },
    ],
  },
  {
    slug: "writing", zh: "AI 写作", en: "AI Writing",
    descZh: "写文章、写论文、写小说、写营销文案", descEn: "Articles, papers, fiction and marketing copy",
    children: [
      { slug: "writing-general", zh: "通用写作", en: "General writing" },
      { slug: "writing-academic", zh: "论文", en: "Academic writing" },
      { slug: "writing-fiction", zh: "小说", en: "Fiction" },
      { slug: "writing-marketing", zh: "营销文案", en: "Marketing copy" },
    ],
  },
  {
    slug: "image", zh: "AI 图像", en: "AI Image",
    descZh: "生成、修图、抠图、放大与商品图", descEn: "Generate, edit, upscale and product shots",
    children: [
      { slug: "image-generation", zh: "图片生成", en: "Image generation" },
      { slug: "image-background", zh: "背景移除", en: "Background removal" },
      { slug: "image-upscale", zh: "放大修复", en: "Upscale & restore" },
      { slug: "image-product", zh: "商品图", en: "Product photos" },
      { slug: "image-logo", zh: "Logo", en: "Logo" },
      { slug: "image-3d", zh: "3D 生成", en: "3D generation" },
    ],
  },
  {
    slug: "video", zh: "AI 视频", en: "AI Video",
    descZh: "文生视频、剪辑、数字人与短剧", descEn: "Text-to-video, editing, avatars and short dramas",
    children: [
      { slug: "video-generation", zh: "视频生成", en: "Video generation" },
      { slug: "video-editing", zh: "剪辑", en: "Editing" },
      { slug: "video-avatar", zh: "数字人", en: "AI avatars" },
      { slug: "video-drama", zh: "短剧", en: "Short drama" },
    ],
  },
  {
    slug: "audio", zh: "AI 音频", en: "AI Audio",
    descZh: "配音、声音克隆、音乐生成与转写", descEn: "Voiceover, voice cloning, music and transcription",
    children: [
      { slug: "audio-tts", zh: "配音 TTS", en: "Text to speech" },
      { slug: "audio-clone", zh: "声音克隆", en: "Voice cloning" },
      { slug: "audio-music", zh: "音乐生成", en: "Music generation" },
      { slug: "audio-transcribe", zh: "转写字幕", en: "Transcription" },
    ],
  },
  {
    slug: "office", zh: "AI 办公", en: "AI Productivity",
    descZh: "PPT、表格、文档、会议与法律", descEn: "Slides, spreadsheets, docs, meetings and legal",
    children: [
      { slug: "office-slides", zh: "PPT", en: "Slides" },
      { slug: "office-sheets", zh: "表格", en: "Spreadsheets" },
      { slug: "office-docs", zh: "文档", en: "Documents" },
      { slug: "office-mindmap", zh: "思维导图", en: "Mind maps" },
      { slug: "office-meeting", zh: "会议", en: "Meetings" },
      { slug: "office-legal", zh: "法律", en: "Legal" },
    ],
  },
  {
    slug: "agents", zh: "AI 智能体", en: "AI Agents",
    descZh: "能自主完成任务的 AI 与智能体搭建平台", descEn: "Agents that complete tasks, and platforms to build them",
    children: [
      { slug: "agents-general", zh: "通用智能体", en: "General agents" },
      { slug: "agents-computer", zh: "操作型", en: "Computer-use agents" },
      { slug: "agents-dev", zh: "开发者智能体", en: "Developer agents" },
      { slug: "agents-builder", zh: "智能体搭建平台", en: "Agent builders" },
    ],
  },
  {
    slug: "coding", zh: "AI 编程", en: "AI Coding",
    descZh: "编程助手、AI IDE 与应用生成", descEn: "Coding assistants, AI IDEs and app builders",
    children: [
      { slug: "coding-assistant", zh: "编程助手", en: "Coding assistants" },
      { slug: "coding-ide", zh: "AI IDE", en: "AI IDEs" },
      { slug: "coding-appgen", zh: "应用生成", en: "App generators" },
    ],
  },
  {
    slug: "design", zh: "AI 设计", en: "AI Design",
    descZh: "UI、平面与配色", descEn: "UI, graphic design and color",
    children: [
      { slug: "design-ui", zh: "UI 设计", en: "UI design" },
      { slug: "design-graphic", zh: "平面设计", en: "Graphic design" },
    ],
  },
  {
    slug: "search", zh: "AI 搜索", en: "AI Search",
    descZh: "带引用的 AI 搜索与学术搜索", descEn: "Answer engines and academic search",
    children: [
      { slug: "search-general", zh: "通用搜索", en: "General search" },
      { slug: "search-academic", zh: "学术搜索", en: "Academic search" },
    ],
  },
  { slug: "browser", zh: "AI 浏览器", en: "AI Browsers", descZh: "内置 AI 的浏览器", descEn: "Browsers with built-in AI" },
  {
    slug: "translation", zh: "AI 翻译", en: "AI Translation",
    descZh: "文档、网页与同传字幕", descEn: "Documents, web pages and live captions",
    children: [
      { slug: "translation-docs", zh: "文档翻译", en: "Document translation" },
      { slug: "translation-web", zh: "网页翻译", en: "Web translation" },
      { slug: "translation-live", zh: "同传字幕", en: "Live captions" },
    ],
  },
  {
    slug: "detection", zh: "AI 内容检测", en: "AI Content Detection",
    descZh: "AI 率检测与查重", descEn: "AI-text detection and plagiarism checks",
  },
  {
    slug: "platforms", zh: "开发平台与模型", en: "Models & Dev Platforms",
    descZh: "模型 API、部署平台、开源模型与评测榜单", descEn: "Model APIs, hosting, open models and leaderboards",
    children: [
      { slug: "platforms-api", zh: "模型 API", en: "Model APIs" },
      { slug: "platforms-deploy", zh: "部署平台", en: "Deployment" },
      { slug: "platforms-open-models", zh: "开源模型", en: "Open models" },
      { slug: "platforms-benchmarks", zh: "评测榜单", en: "Benchmarks" },
    ],
  },
  { slug: "prompts", zh: "提示词", en: "Prompts", descZh: "提示词库与提示词工具", descEn: "Prompt libraries and tools" },
  { slug: "learning", zh: "学习资源", en: "Learning", descZh: "课程、教程与社区", descEn: "Courses, tutorials and communities" },
];
