import { afterEach, describe, expect, it, vi } from "vitest";
import { WgerUnavailableError, getWgerExercise, resetWgerClientCacheForTests, searchWgerExercises } from "./wger-client";

const upstreamExercise = {
  category: { name: "Chest" },
  equipment: [{ name: "Barbell" }],
  id: 42,
  muscles: [{ name: "Pectoralis major" }],
  name: "Bench press",
  translations: []
};

describe("wger client", () => {
  afterEach(() => {
    resetWgerClientCacheForTests();
    vi.unstubAllGlobals();
  });

  it("maps a bounded wger response to references without returning upstream descriptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ next: null, results: [{ ...upstreamExercise, description: "must not escape" }] }), {
          status: 200
        })
      )
    );

    await expect(searchWgerExercises({ page: 1, query: "bench" })).resolves.toEqual({
      hasMore: false,
      items: [
        {
          category: "胸部",
          equipment: ["杠铃"],
          externalId: "42",
          muscles: ["胸大肌"],
          name: "胸大肌训练动作 42",
          provider: "wger",
          sourceUrl: "https://wger.de/en/exercise/42"
        }
      ]
    });
  });

  it("prefers Chinese exercise names and localizes catalog metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      next: null,
      results: [{
        ...upstreamExercise,
        translations: [{ name: "Bench press" }, { name: "杠铃卧推" }]
      }]
    }), { status: 200 })));

    await expect(searchWgerExercises({ page: 1, query: "bench" })).resolves.toMatchObject({
      items: [{ category: "胸部", equipment: ["杠铃"], muscles: ["胸大肌"], name: "杠铃卧推" }]
    });
  });

  it("uses Chinese-only fallbacks when Wger has no Chinese translation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      next: null,
      results: [{ ...upstreamExercise, translations: [{ name: "Bench press" }] }]
    }), { status: 200 })));

    await expect(searchWgerExercises({ page: 1, query: "bench" })).resolves.toMatchObject({
      items: [{ name: "胸大肌训练动作 42" }]
    });
  });

  it("uses the fixed exerciseinfo endpoint and clamps untrusted page input", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ next: null, results: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await searchWgerExercises({ category: "11", page: 999, query: "bench" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/api/v2/exerciseinfo/",
        search: expect.stringContaining("offset=980")
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("maps common Chinese lift names to the English catalog query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ next: null, results: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await searchWgerExercises({ page: 1, query: "卧推" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: expect.stringContaining("name__search=bench") }),
      expect.anything()
    );
  });

  it("returns a typed unavailable error when wger times out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));

    await expect(searchWgerExercises({ page: 1, query: "bench" })).rejects.toBeInstanceOf(WgerUnavailableError);
  });

  it("returns null for a missing exercise detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(getWgerExercise("42")).resolves.toBeNull();
  });
});
