/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn()
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      verifyOtp: mocks.verifyOtp
    }
  })
}));

import { EmailLoginForm } from "./email-login-form";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  mocks.signInWithOtp.mockReset();
  mocks.verifyOtp.mockReset();
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
});

describe("EmailLoginForm", () => {
  it("sends an email OTP and reveals the six-digit code step", async () => {
    await renderForm();
    const emailInput = getInput("邮箱");
    setInput(emailInput, "athlete@example.com");

    await clickButton("获取验证码");

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: "athlete@example.com" });
    expect(getInput("验证码").getAttribute("inputmode")).toBe("numeric");
    expect(getInput("验证码").getAttribute("maxlength")).toBe("6");
  });

  it("verifies exactly six digits and rejects shorter codes", async () => {
    await renderForm();
    setInput(getInput("邮箱"), "athlete@example.com");
    await clickButton("获取验证码");

    const codeInput = getInput("验证码");
    setInput(codeInput, "12345");
    expect(getButton("登录").disabled).toBe(true);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();

    setInput(codeInput, "123456");
    await clickButton("登录");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "athlete@example.com", token: "123456", type: "email" });
  });

  it("keeps the code step and displays an error when verification fails", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: new Error("验证码错误") });
    await renderForm();
    setInput(getInput("邮箱"), "athlete@example.com");
    await clickButton("获取验证码");
    setInput(getInput("验证码"), "123456");
    await clickButton("登录");

    expect(getInput("验证码")).toBeTruthy();
    expect(container?.textContent).toContain("验证码错误");
  });

  it("allows changing the email and does not render the removed pasted-link UI", async () => {
    await renderForm();
    expect(container?.textContent).not.toContain(["粘贴", "邮件", "链接登录"].join(""));
    expect(container?.textContent).not.toContain("Gm" + "ail");

    setInput(getInput("邮箱"), "athlete@example.com");
    await clickButton("获取验证码");
    await clickButton("修改邮箱");

    expect(getInput("邮箱")).toBeTruthy();
    expect(container?.querySelector("#login-code")).toBeNull();
  });

  it("enforces a sixty-second resend cooldown", async () => {
    vi.useFakeTimers();
    await renderForm();
    setInput(getInput("邮箱"), "athlete@example.com");
    await clickButton("获取验证码");

    const resend = getButton("重新发送验证码");
    expect(resend.disabled).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(getButton("重新发送验证码").disabled).toBe(false);
  });
});

async function renderForm() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<EmailLoginForm />);
    await Promise.resolve();
  });
}

function getInput(label: string) {
  const input = Array.from(container?.querySelectorAll("input") ?? []).find((candidate) => {
    const id = candidate.getAttribute("id");
    return id && container?.querySelector(`label[for="${id}"]`)?.textContent?.includes(label);
  });
  if (!input) throw new Error(`input not found: ${label}`);
  return input as HTMLInputElement;
}

function getButton(label: string) {
  const button = Array.from(container?.querySelectorAll("button") ?? []).find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`button not found: ${label}`);
  return button as HTMLButtonElement;
}

async function clickButton(label: string) {
  await act(async () => {
    getButton(label).click();
    await Promise.resolve();
  });
}

function setInput(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
