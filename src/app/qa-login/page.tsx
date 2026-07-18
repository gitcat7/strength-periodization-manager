import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LocalQaLogin } from "@/components/auth/local-qa-login";
import { isLocalDevelopmentHost } from "@/lib/dev-qa-auth";

export default async function QaLoginPage() {
  const requestHeaders = await headers();
  const hostname = (requestHeaders.get("host") ?? "").split(":")[0];

  if (!isLocalDevelopmentHost({ hostname, nodeEnv: process.env.NODE_ENV })) {
    notFound();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-[20px] border border-line bg-white p-5 shadow-sm">
        <Suspense fallback={<p className="text-center text-sm text-muted">正在建立本地 QA 会话...</p>}>
          <LocalQaLogin />
        </Suspense>
      </section>
    </main>
  );
}
