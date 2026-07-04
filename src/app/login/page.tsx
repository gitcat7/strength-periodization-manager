import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { EmailLoginForm } from "@/components/auth/email-login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-[20px] border border-line bg-white p-5 shadow-sm">
        <Link className="mb-6 inline-flex items-center gap-1 text-sm text-muted" href="/">
          <ChevronLeft size={16} />
          返回首页
        </Link>

        <div className="mb-6 space-y-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-action/10 text-action">
            <ShieldCheck size={22} />
          </span>
          <div>
            <p className="text-sm text-muted">力训周期管家</p>
            <h1 className="text-2xl font-semibold">登录或注册</h1>
          </div>
          <p className="text-sm leading-6 text-muted">
            输入邮箱获取登录链接。MVP 阶段先使用邮箱魔法链接，减少密码管理和账号安全负担。
          </p>
        </div>

        <EmailLoginForm />
      </section>
    </main>
  );
}

