import { Suspense } from "react";
import { AuthCallbackHandler } from "@/components/auth/auth-callback-handler";

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-[20px] border border-line bg-white p-5 shadow-sm">
        <Suspense fallback={<p className="text-sm text-muted">正在完成登录...</p>}>
          <AuthCallbackHandler />
        </Suspense>
      </section>
    </main>
  );
}

