import {
  isWgerExternalId,
  type ExternalExerciseReference
} from "@/domain/external-exercise";

const DEFAULT_WGER_BASE_URL = "https://wger.de/api/v2/";
const PAGE_SIZE = 20;
const MAX_PAGE = 50;
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 5 * 60 * 1_000;

type WgerExerciseInfo = {
  category?: { name?: unknown } | null;
  equipment?: Array<{ name?: unknown }>;
  id?: unknown;
  muscles?: Array<{ name?: unknown }>;
  name?: unknown;
  translations?: Array<{ name?: unknown }>;
};

type WgerPage = {
  next?: unknown;
  results?: unknown;
};

type Cached<T> = { expiresAt: number; value: T };

const cache = new Map<string, Cached<unknown>>();

export class WgerUnavailableError extends Error {
  code = "WGER_UNAVAILABLE" as const;

  constructor() {
    super("The external exercise service is currently unavailable.");
    this.name = "WgerUnavailableError";
  }
}

export async function searchWgerExercises(input: {
  category?: string;
  page: number;
  query: string;
}): Promise<{ items: ExternalExerciseReference[]; hasMore: boolean }> {
  const page = clampPage(input.page);
  const query = normalizeCatalogQuery(input.query);
  const category = sanitizeCategory(input.category);
  const url = upstreamUrl("exerciseinfo/", {
    language__code: "en",
    limit: String(PAGE_SIZE),
    name__search: query,
    offset: String((page - 1) * PAGE_SIZE),
    ...(category ? { category } : {})
  });
  const key = url.toString();
  const cached = getCached<{ items: ExternalExerciseReference[]; hasMore: boolean }>(key);
  if (cached) return cached;

  const data = await requestJson(url);
  const pageData = parsePage(data);
  const value = {
    hasMore: typeof pageData.next === "string" && pageData.next.length > 0,
    items: pageData.results.slice(0, PAGE_SIZE).flatMap((result) => {
      const reference = toExternalExerciseReference(result);
      return reference ? [reference] : [];
    })
  };
  setCached(key, value);
  return value;
}

export async function getWgerExercise(externalId: string): Promise<ExternalExerciseReference | null> {
  if (!isWgerExternalId(externalId)) return null;
  const url = upstreamUrl(`exerciseinfo/${externalId}/`, {});
  const key = url.toString();
  const cached = getCached<ExternalExerciseReference | null>(key);
  if (cached !== undefined) return cached;

  const response = await request(url);
  if (response.status === 404) {
    setCached(key, null);
    return null;
  }
  if (!response.ok) throw new WgerUnavailableError();
  const payload = await readJson(response);
  const value = isWgerExerciseInfo(payload) ? toExternalExerciseReference(payload) : null;
  if (!value) throw new WgerUnavailableError();
  setCached(key, value);
  return value;
}

function upstreamUrl(path: "exerciseinfo/" | `exerciseinfo/${string}/`, query: Record<string, string>) {
  const base = wgerBaseUrl();
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
}

function wgerBaseUrl() {
  const configured = process.env.WGER_API_BASE_URL ?? DEFAULT_WGER_BASE_URL;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.hostname !== "wger.de" || url.pathname !== "/api/v2/") {
      throw new Error("invalid wger base URL");
    }
    return url;
  } catch {
    return new URL(DEFAULT_WGER_BASE_URL);
  }
}

function clampPage(page: number) {
  return Number.isInteger(page) ? Math.max(1, Math.min(MAX_PAGE, page)) : 1;
}

function normalizeCatalogQuery(query: string) {
  const normalized = query.trim().slice(0, 80).toLowerCase();
  const aliases: Record<string, string> = {
    "卧推": "bench",
    "杠铃卧推": "bench",
    "深蹲": "squat",
    "杠铃深蹲": "squat",
    "硬拉": "deadlift",
    "划船": "row",
    "推举": "overhead press"
  };
  return aliases[normalized] ?? normalized;
}

function sanitizeCategory(category: string | undefined) {
  return category && /^[1-9]\d{0,4}$/.test(category) ? category : undefined;
}

async function requestJson(url: URL) {
  const response = await request(url);
  if (!response.ok) throw new WgerUnavailableError();
  return readJson(response);
}

async function request(url: URL) {
  try {
    return await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch {
    throw new WgerUnavailableError();
  }
}

async function readJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new WgerUnavailableError();
  }

  try {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new WgerUnavailableError();
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof WgerUnavailableError) throw error;
    throw new WgerUnavailableError();
  }
}

function parsePage(value: unknown): { next: unknown; results: WgerExerciseInfo[] } {
  if (!isObject(value) || !Array.isArray(value.results)) throw new WgerUnavailableError();
  return {
    next: value.next,
    results: value.results.filter(isWgerExerciseInfo)
  };
}

function toExternalExerciseReference(value: WgerExerciseInfo): ExternalExerciseReference | null {
  const externalId = typeof value.id === "number" || typeof value.id === "string" ? String(value.id) : "";
  if (!isWgerExternalId(externalId)) return null;
  const category = localizeCatalogText(readName(value.category) ?? "", "其他");
  const equipment = readNames(value.equipment).map((item) => localizeCatalogText(item, "其他器械"));
  const muscles = readNames(value.muscles).map((item) => localizeCatalogText(item, "其他肌群"));
  const name = readChineseName(value.translations) ?? readChineseText(readName(value)) ?? `${muscles[0] ?? category}训练动作 ${externalId}`;

  return {
    category,
    equipment,
    externalId,
    muscles,
    name,
    provider: "wger",
    sourceUrl: `https://wger.de/en/exercise/${externalId}`
  };
}

function readChineseName(values: unknown) {
  if (!Array.isArray(values)) return null;
  for (const value of values) {
    const name = readName(value);
    if (name && /[\u3400-\u9fff]/.test(name)) return name;
  }
  return null;
}

function readChineseText(value: string | null) {
  return value && /[\u3400-\u9fff]/.test(value) ? value : null;
}

function localizeCatalogText(value: string, fallback: string) {
  const translations: Record<string, string> = {
    Arms: "手臂", Back: "背部", Barbell: "杠铃", Bench: "训练凳", Chest: "胸部", Dumbbell: "哑铃",
    "Gluteus maximus": "臀大肌", Hamstrings: "腘绳肌", Legs: "腿部", "Latissimus dorsi": "背阔肌",
    "none (bodyweight exercise)": "徒手", "Pectoralis major": "胸大肌", Quadriceps: "股四头肌",
    Shoulders: "肩部", Trapezius: "斜方肌", "Triceps brachii": "肱三头肌"
  };
  return translations[value] ?? fallback;
}

function readName(value: unknown) {
  if (!isObject(value)) return null;
  return typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 160) : null;
}

function readNames(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const name = readName(value);
    return name ? [name] : [];
  }).slice(0, 12);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isWgerExerciseInfo(value: unknown): value is WgerExerciseInfo {
  return isObject(value);
}

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T) {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

export function resetWgerClientCacheForTests() {
  cache.clear();
}
