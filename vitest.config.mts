import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "**/.claude/**"],
    // Vitest's Vite transform does not expose arbitrary shell variables to
    // test workers by default. Keep the authenticated release smoke opt-in,
    // while passing its documented inputs through when an operator supplies
    // them explicitly.
    env: {
      BASE_URL: process.env.BASE_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      QA_SMOKE_EMAIL: process.env.QA_SMOKE_EMAIL,
      QA_SMOKE_PASSWORD: process.env.QA_SMOKE_PASSWORD
    }
  }
});
