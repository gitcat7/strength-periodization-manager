import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto max-w-3xl rounded-[20px] border border-line bg-white p-5 shadow-sm">
        <Link className="mb-5 inline-flex items-center gap-1 text-sm text-muted" href="/settings">
          <ChevronLeft size={16} />
          返回设置
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-action text-white">
            <ShieldCheck size={22} />
          </span>
          <div>
            <p className="text-sm text-muted">内测版数据说明</p>
            <h1 className="text-2xl font-semibold">隐私与数据</h1>
          </div>
        </div>

        <div className="space-y-4 text-sm leading-7 text-muted">
          <section className="rounded-xl border border-line p-4">
            <h2 className="mb-2 font-semibold text-ink">会保存哪些数据</h2>
            <p>系统会保存你的邮箱、训练画像、训练计划、每组训练记录、Coach 调整建议和 PR 目标。</p>
          </section>

          <section className="rounded-xl border border-line p-4">
            <h2 className="mb-2 font-semibold text-ink">数据用途</h2>
            <p>这些数据只用于生成训练计划、恢复训练记录、计算进展趋势、导出 CSV 和改进 MVP 体验。</p>
          </section>

          <section className="rounded-xl border border-line p-4">
            <h2 className="mb-2 font-semibold text-ink">数据导出</h2>
            <p>你可以在设置页导出已完成训练记录 CSV。内测阶段如需删除账号或数据，由开发者手动协助处理。</p>
          </section>

          <section className="rounded-xl border border-amber/30 bg-amber/10 p-4">
            <h2 className="mb-2 font-semibold text-ink">安全提示</h2>
            <p>本产品不构成医疗、康复或个性化诊断建议。大重量和 PR 测试前请充分热身，并优先使用安全保护。</p>
          </section>
        </div>
      </section>
    </main>
  );
}
