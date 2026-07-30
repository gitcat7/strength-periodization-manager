# Settings and Global Mobile Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize settings around ordinary user tasks, hide low-frequency advanced controls by default, confirm destructive actions, and close the remaining global mobile accessibility contracts.

**Architecture:** Preserve `SettingsPanel` as the owner of authentication, CSV export, cache clearing, and Agent token operations. Add one reusable confirmation dialog and one settings disclosure component; use existing global styles instead of introducing a broad component library or modifying previously accepted product flows.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Vitest, React DOM test utilities.

## Global Constraints

- Mobile Web/PWA is the primary surface.
- Settings groups are exactly: `账号`, `训练偏好`, `数据管理`, and `高级功能`.
- `高级功能` is collapsed by default and contains Agent authorization, diagnostics, and other low-frequency maintenance entry points.
- Privacy and feedback remain easy to find without opening advanced settings.
- `退出登录` and `撤销 Agent 令牌` require explicit confirmation.
- Cancelling confirmation makes no network request and keeps the user on the current page.
- Existing Supabase queries, token hashing, CSV contents, cache keys, authentication, database contracts, and product algorithms remain unchanged.
- No SQL migration, RPC, schema, dependency, or environment change.
- Existing bottom navigation, safe-area spacing, semantic status colors, focus ring, and reduced-motion behavior must remain intact.
- Primary controls are at least 44px high.
- Numeric inputs and metrics keep tabular figures and decimal values such as `22.5` remain visible.
- 375px, 390px, and 430px layouts must not horizontally overflow.
- User-visible errors must remain Chinese task-oriented messages, not bare `TypeError` or `Load failed`.

---

### Task 1: Reusable destructive-action confirmation dialog

**Files:**
- Create: `src/components/ui/confirmation-dialog.tsx`
- Create: `src/components/ui/confirmation-dialog.test.tsx`

**Interfaces:**
- Produces:

```ts
export type ConfirmationDialogProps = {
  busy?: boolean;
  confirmLabel: string;
  description: string;
  onCancel(): void;
  onConfirm(): void;
  open: boolean;
  title: string;
};
```

- [ ] **Step 1: Write failing dialog tests**

```tsx
/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ConfirmationDialog } from "./confirmation-dialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("renders only when open and exposes cancel and destructive confirmation", () => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const view = document.createElement("div");
  const root = createRoot(view);
  act(() => root.render(
    <ConfirmationDialog
      confirmLabel="确认退出"
      description="退出后需要重新登录。"
      onCancel={onCancel}
      onConfirm={onConfirm}
      open
      title="退出登录？"
    />
  ));
  expect(view.querySelector("[role='dialog']")?.getAttribute("aria-modal")).toBe("true");
  const buttons = [...view.querySelectorAll("button")];
  expect(buttons.every((button) => button.className.includes("h-11"))).toBe(true);
  act(() => buttons.find((button) => button.textContent === "取消")?.click());
  expect(onCancel).toHaveBeenCalledOnce();
  act(() => buttons.find((button) => button.textContent === "确认退出")?.click());
  expect(onConfirm).toHaveBeenCalledOnce();
  act(() => root.unmount());
});
```

Also assert that `open={false}` renders no dialog and `busy` disables both actions to prevent duplicate submission.

- [ ] **Step 2: Verify RED**

```powershell
pnpm vitest run src/components/ui/confirmation-dialog.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the dialog**

Use `role="dialog"`, `aria-modal="true"`, an accessible title, a fixed mobile bottom-sheet layout with `sm:place-items-center`, a neutral `取消` button, and a red bordered/fill destructive confirmation. Both buttons use `h-11`; confirmation is disabled while `busy`.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
pnpm vitest run src/components/ui/confirmation-dialog.test.tsx
git add src/components/ui/confirmation-dialog.tsx src/components/ui/confirmation-dialog.test.tsx
git commit -m "feat: add destructive confirmation dialog"
```

### Task 2: Default-collapsed advanced settings

**Files:**
- Create: `src/components/settings/advanced-settings-disclosure.tsx`
- Create: `src/components/settings/advanced-settings-disclosure.test.tsx`

**Interfaces:**
- Produces:

```ts
export function AdvancedSettingsDisclosure({
  children
}: {
  children: React.ReactNode;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing disclosure test**

Render the component with `Agent 授权内容` as a child. Assert:

- the button is named `高级功能`;
- `aria-expanded` starts as `false`;
- the child is not present before expansion;
- the button is `h-11`;
- clicking the unique button changes `aria-expanded` to `true` and reveals the child;
- clicking it again hides the child.

- [ ] **Step 2: Verify RED**

```powershell
pnpm vitest run src/components/settings/advanced-settings-disclosure.test.tsx
```

Expected: FAIL because the disclosure component does not exist.

- [ ] **Step 3: Implement the disclosure**

Own only local expanded state. Use a semantic button with `aria-controls`, `aria-expanded`, a chevron, concise copy `Agent 授权、诊断与维护`, and render children only while expanded so low-frequency controls are not focusable while collapsed.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
pnpm vitest run src/components/settings/advanced-settings-disclosure.test.tsx
git add src/components/settings/advanced-settings-disclosure.tsx src/components/settings/advanced-settings-disclosure.test.tsx
git commit -m "feat: collapse advanced settings"
```

### Task 3: Reorganize SettingsPanel and confirm high-impact actions

**Files:**
- Modify: `src/components/settings/settings-panel.tsx`
- Create: `src/components/settings/settings-panel.test.tsx`

**Interfaces:**
- Consumes: `AdvancedSettingsDisclosure` and `ConfirmationDialog`.
- Preserves: `exportTrainingCsv`, `clearLocalCache`, `signOut`, `loadAgentTokens`, `createAgentToken`, `revokeAgentToken`, and their existing Supabase/cache behavior.

- [ ] **Step 1: Write failing settings hierarchy tests**

Mock `createBrowserSupabaseClient` with a logged-in user and token query. Render `SettingsPanel`, settle effects with `act`, then assert visible section headings are ordered:

```ts
["账号", "训练偏好", "数据管理", "高级功能"]
```

Assert `Agent 中文操作授权`, active tokens, and `/diagnostics` are absent until the unique `高级功能` disclosure button is clicked. Assert privacy and feedback links are visible without expanding advanced settings.

- [ ] **Step 2: Write failing confirmation tests**

For sign-out:

1. click `退出登录`;
2. assert the dialog says `退出登录？`;
3. click `取消` and verify `supabase.auth.signOut` was not called;
4. reopen, click `确认退出`, and verify `signOut` is called exactly once.

For token revocation:

1. expand advanced;
2. click the unique token revoke button;
3. assert the dialog includes the token name;
4. cancel and verify no update query;
5. confirm and verify the existing `revoked_at` update is sent once.

- [ ] **Step 3: Verify RED**

```powershell
pnpm vitest run src/components/settings/settings-panel.test.tsx
```

Expected: FAIL because the current page uses different groups, advanced content is always open, and destructive actions run immediately.

- [ ] **Step 4: Recompose the four groups**

Use the following exact ownership:

- `账号`: email identity, privacy, feedback, and the visually separated exit action;
- `训练偏好`: adjust plan parameters and open exercise library;
- `数据管理`: export CSV and clear local cache;
- `高级功能`: Agent authorization, `/diagnostics`, and low-frequency maintenance copy.

Keep the medical/training disclaimer outside these operational groups at the bottom. Do not move or duplicate business logic.

- [ ] **Step 5: Add explicit pending-action state**

Use a discriminated union:

```ts
type PendingConfirmation =
  | { type: "sign-out" }
  | { tokenId: string; tokenName: string; type: "revoke-token" }
  | null;
```

Ordinary buttons only set this state. `ConfirmationDialog.onConfirm` invokes the existing `signOut` or `revokeAgentToken`, and closes only after success. Cancel clears state without side effects. Disable both dialog actions while the corresponding request is working.

Change `revokeAgentToken(tokenId)` to return `Promise<boolean>`: return `false` after the existing error branch and `true` after the token list refresh succeeds. The confirm handler clears `PendingConfirmation` only on `true`. `signOut` keeps the dialog open while working; successful sign-out navigates to `/login`, while failure leaves the dialog available for retry.

- [ ] **Step 6: Keep user-facing failures task-oriented**

When Supabase returns a raw error, prefix it with the failed task:

- `退出失败：…`
- `令牌撤销失败：…`
- `设置读取失败：…`

Do not show only `TypeError`, `Load failed`, or an untranslated exception.

- [ ] **Step 7: Verify and commit**

```powershell
pnpm vitest run src/components/ui/confirmation-dialog.test.tsx src/components/settings/advanced-settings-disclosure.test.tsx src/components/settings/settings-panel.test.tsx
git add src/components/settings/settings-panel.tsx src/components/settings/settings-panel.test.tsx
git commit -m "feat: organize and safeguard settings"
```

### Task 4: Global mobile and accessibility contract

**Files:**
- Modify: `src/app/globals.css`
- Create: `scripts/global-mobile-ui-contract.test.mjs`
- Modify only if required by a failing contract: `src/components/navigation/bottom-nav.tsx`

**Interfaces:**
- Verifies global CSS contracts; no runtime data or persistence.

- [ ] **Step 1: Write the failing global contract test**

Read `src/app/globals.css` and `src/components/navigation/bottom-nav.tsx` as source. Assert:

1. body/app shell include `env(safe-area-inset-bottom)`;
2. `:focus-visible` has a visible outline;
3. `prefers-reduced-motion: reduce` is present;
4. controls inherit the application font;
5. numeric inputs use `font-variant-numeric: tabular-nums`;
6. bottom navigation has a safe-area-aware bottom padding and navigation label;
7. no rule removes focus outlines without a replacement.

- [ ] **Step 2: Verify RED**

```powershell
pnpm vitest run scripts/global-mobile-ui-contract.test.mjs
```

Expected: FAIL on the missing numeric-input tabular-figures contract; existing safe-area, focus, and reduced-motion requirements should already pass.

- [ ] **Step 3: Add the smallest missing global rules**

Add:

```css
input[type="number"],
.tabular-nums {
  font-variant-numeric: tabular-nums;
}

button,
a,
input,
select,
textarea {
  -webkit-tap-highlight-color: transparent;
}
```

Do not add blanket `overflow-x: hidden`; fix any discovered component overflow at its source. Do not replace the established color palette, radii, shadows, or typography.

- [ ] **Step 4: Verify and commit**

```powershell
pnpm vitest run scripts/global-mobile-ui-contract.test.mjs src/components/navigation/bottom-nav.test.ts
git add src/app/globals.css scripts/global-mobile-ui-contract.test.mjs
git commit -m "test: lock global mobile ui contracts"
```

### Task 5: Final product regression and release gate

**Files:**
- Modify only previously listed files if an in-scope verification issue appears.

- [ ] **Step 1: Run focused tests**

```powershell
pnpm vitest run src/components/ui/confirmation-dialog.test.tsx src/components/settings/advanced-settings-disclosure.test.tsx src/components/settings/settings-panel.test.tsx scripts/global-mobile-ui-contract.test.mjs src/components/navigation/bottom-nav.test.ts
```

Expected: all focused tests pass without unhandled React update warnings in newly added tests.

- [ ] **Step 2: Run the complete suite**

```powershell
pnpm test
```

Expected: no failures; the intentionally skipped environment smoke may remain skipped.

- [ ] **Step 3: Run release check**

```powershell
pnpm release:check
```

Expected: typecheck, production build, and local 14-route smoke pass.

- [ ] **Step 4: Mobile acceptance**

At 375px, 390px, and 430px verify:

- settings has no page-level horizontal overflow;
- the four groups are clear and advanced starts closed;
- ordinary users can reach plan preferences, export, cache clearing, privacy, feedback, and exit without opening advanced;
- Agent tokens and diagnostics are hidden until expansion;
- exit and revoke both require confirmation and cancellation is side-effect free;
- every actionable control and dialog action is at least 44px;
- long email, token name, and generated token text wrap instead of overflowing;
- keyboard focus remains visible and reduced-motion rules remain active.

- [ ] **Step 5: Boundary audit**

```powershell
git diff --check
git status --short
git diff --name-only 4578d1df0ea2dbf5f89eb977e83771bfc4dd3926..HEAD
```

Reject migrations, schema/RPC changes, authentication contract changes, training/Coach/PR algorithms, plan generation, or unrelated page edits.

## Independent Test and Release Gate

The implementation task must provide a fixed commit, clean worktree, focused/full/release evidence, and notify the existing “测试” task.

The independent test task must verify:

1. the four settings groups and their order;
2. advanced content is closed and unfocusable by default;
3. privacy/feedback and ordinary settings remain available outside advanced;
4. sign-out and token revocation require confirmation;
5. cancellation sends no request and failed requests keep a recoverable state;
6. CSV, cache clearing, token creation/hashing, and auth behavior are unchanged;
7. safe area, focus, reduced motion, numeric figures, touch sizes, and mobile widths pass;
8. no SQL/RPC/algorithm/dependency changes exist.

Only after an explicit “验证通过” may the implementation task deploy the fixed commit. The deployment report must include commit, deployment ID, deployment URL, production URL, and 14-route production smoke results, then notify the architect task for final acceptance.
