import Link from "next/link";
import { CircleAlert } from "lucide-react";

export default function NotFoundPage() {
  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto max-w-xl rounded-[20px] border border-line bg-white p-5 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-field text-muted">
          <CircleAlert size={24} />
        </span>
        <h1 className="mt-4 text-2xl font-semibold">页面不存在</h1>
        <p className="mt-2 text-sm leading-6 text-muted">这个链接可能已经失效，或者页面还没有开放。</p>
        <Link className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-action px-4 font-semibold text-white" href="/">
          回到工作台
        </Link>
      </section>
    </main>
  );
}
