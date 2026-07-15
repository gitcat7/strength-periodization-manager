import { expect, test } from "vitest";

const baseUrl = process.env.BASE_URL?.replace(/\/$/, "");

test.skipIf(!baseUrl)("rest-day routes remain reachable", async () => {
  for (const path of ["/plan", "/today"]) {
    const response = await fetch(`${baseUrl}${path}`);
    expect(response.status).toBe(200);
  }
});
