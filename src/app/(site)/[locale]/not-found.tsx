import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20">
      <h1 className="font-display text-3xl font-semibold">404</h1>
      <p className="mt-2 text-muted">没有找到这个页面。We couldn&apos;t find that page.</p>
      <p className="mt-6 flex gap-4">
        <Link href="/zh" className="underline">回到首页</Link>
        <Link href="/" className="underline">Back to home</Link>
      </p>
    </div>
  );
}
