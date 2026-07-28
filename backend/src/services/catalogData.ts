import { env } from "../config/env.js";
import { fetchUpstreamCached } from "./upstreamCache.js";

/**
 * Серверный аналог frontend getAllIsolationConstr + buildTitleByCodeMap.
 * Используется для рендера PDF КП: названия секций и блок Info (характеристики, картинки).
 */

const CATALOG_PATH = "/api/v1/AllIsolationConstr";
const CATALOG_CACHE_KEY = "AllIsolationConstr";

export type CatalogEntry = { name: string; description: string };

export type ConstructionCatalogEntry = CatalogEntry & {
  specification: string;
  thickness: string;
  soundIndex: string;
  impactNoiseIndex: number | null;
  img: string | null;
  cadImg: string | null;
};

const parseList = (payload: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === "object") {
    const data = (payload as Record<string, unknown>).data;
    if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  }
  return [];
};

const rowToEntry = (row: Record<string, unknown>): ConstructionCatalogEntry => {
  const impactRaw = row.ImpactNoseIndex ?? row.impactNoseIndex;
  let impactNoiseIndex: number | null = null;
  if (impactRaw !== undefined && impactRaw !== null && impactRaw !== "") {
    const n = Number(impactRaw);
    if (Number.isFinite(n) && n !== 0) impactNoiseIndex = n;
  }
  const img =
    typeof row.Img === "string"
      ? row.Img
      : typeof row.img === "string"
        ? row.img
        : null;
  const cadImg =
    typeof row.CadImg === "string"
      ? row.CadImg
      : typeof row.cadImg === "string"
        ? row.cadImg
        : null;

  return {
    name: typeof row.Name === "string" ? row.Name : "",
    description: typeof row.Description === "string" ? row.Description : "",
    specification: typeof row.Specification === "string" ? row.Specification : "",
    thickness:
      row.Thickness !== undefined && row.Thickness !== null && row.Thickness !== ""
        ? String(row.Thickness)
        : "",
    soundIndex:
      row.SoundIndex !== undefined && row.SoundIndex !== null && row.SoundIndex !== ""
        ? String(row.SoundIndex)
        : "",
    impactNoiseIndex,
    img,
    cadImg,
  };
};

let catalogLoadPromise: Promise<Map<string, ConstructionCatalogEntry>> | null = null;

const loadConstructionCatalog = async (): Promise<Map<string, ConstructionCatalogEntry>> => {
  const targetBase = env.calcServiceUrl.replace(/\/$/, "");
  const cached = await fetchUpstreamCached(CATALOG_CACHE_KEY, async () => {
    const upstream = await fetch(`${targetBase}${CATALOG_PATH}`, {
      method: "GET",
      headers: { accept: "application/json", origin: targetBase, referer: `${targetBase}/` },
      signal: AbortSignal.timeout(env.calcServiceTimeoutMs),
    });
    const headers: Record<string, string> = {};
    for (const name of ["content-type", "cache-control", "etag", "last-modified"]) {
      const v = upstream.headers.get(name);
      if (v) headers[name] = v;
    }
    const body = upstream.body ? Buffer.from(await upstream.arrayBuffer()) : Buffer.alloc(0);
    return { status: upstream.status, headers, body };
  });

  const result = new Map<string, ConstructionCatalogEntry>();
  if (cached.status >= 400 || cached.body.length === 0) return result;
  let payload: unknown = null;
  try {
    payload = JSON.parse(cached.body.toString("utf-8"));
  } catch {
    return result;
  }

  for (const row of parseList(payload)) {
    const code = row.Code;
    if (typeof code !== "string" || !code) continue;
    result.set(code, rowToEntry(row));
  }
  return result;
};

export const buildConstructionCatalog = (): Promise<Map<string, ConstructionCatalogEntry>> => {
  if (!catalogLoadPromise) {
    catalogLoadPromise = loadConstructionCatalog().catch((err) => {
      catalogLoadPromise = null;
      throw err;
    });
  }
  return catalogLoadPromise;
};

export const buildTitleByCode = async (): Promise<Map<string, CatalogEntry>> => {
  const full = await buildConstructionCatalog();
  const result = new Map<string, CatalogEntry>();
  for (const [code, entry] of full) {
    result.set(code, { name: entry.name, description: entry.description });
  }
  return result;
};
