import { SupabaseDiagnostics } from "@/components/diagnostics/supabase-diagnostics";

export default function DiagnosticsPage() {
  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto max-w-2xl rounded-[20px] border border-line bg-white p-5 shadow-sm">
        <div className="mb-6">
          <p className="text-sm text-muted">Supabase 配置检查</p>
          <h1 className="text-2xl font-semibold">项目诊断</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            用这个页面确认环境变量、邮箱登录和数据库 RLS 是否已经接通。
          </p>
        </div>

        <SupabaseDiagnostics />
      </section>
    </main>
  );
}

