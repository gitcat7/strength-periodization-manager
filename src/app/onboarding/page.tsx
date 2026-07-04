import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

export default function OnboardingPage() {
  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto max-w-2xl rounded-[20px] border border-line bg-white p-5 shadow-sm">
        <Link className="mb-5 inline-flex items-center gap-1 text-sm text-muted" href="/">
          <ChevronLeft size={16} />
          返回首页
        </Link>

        <div className="mb-6">
          <p className="text-sm text-muted">第 1 步</p>
          <h1 className="text-2xl font-semibold">创建训练画像</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            先保存最小训练信息，下一步会基于这些数据生成 3 天或 4 天力量训练计划。
          </p>
        </div>

        <OnboardingForm />
      </section>
    </main>
  );
}

