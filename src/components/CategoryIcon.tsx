import {
  AppWindow, Bot, BookOpen, Code2, Compass, Cpu, FileCheck2, Image as ImageIcon, Languages, Layers,
  MessagesSquare, Mic, Palette, PenLine, Presentation, Search, Sparkles, Terminal, Video,
} from "lucide-react";

const ICONS: Record<string, typeof Bot> = {
  chat: MessagesSquare,
  writing: PenLine,
  image: ImageIcon,
  video: Video,
  audio: Mic,
  office: Presentation,
  agents: Bot,
  coding: Code2,
  design: Palette,
  search: Search,
  browser: AppWindow,
  translation: Languages,
  detection: FileCheck2,
  platforms: Cpu,
  prompts: Terminal,
  learning: BookOpen,
  explore: Compass,
  more: Layers,
};

export function CategoryIcon({ slug, className = "h-4 w-4" }: { slug: string; className?: string }) {
  const Icon = ICONS[slug] ?? Sparkles;
  return <Icon aria-hidden className={className} strokeWidth={1.75} />;
}
