import { env } from "../config/env.js";
import { fetchUpstreamCached } from "./upstreamCache.js";

const parseMaterialsArray = (payload: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === "object") {
    const data = (payload as Record<string, unknown>).data;
    if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  }
  return [];
};

/**
 * Состав конструкции для PDF (как «Состав конструкции» на Info):
 * GET /api/v1/IsolationConstrMaterials/{code}, только названия материалов.
 */
export const loadCompositionMaterialNames = async (code: string): Promise<string[]> => {
  const trimmed = String(code ?? "").trim();
  if (!trimmed) return [];

  const cacheKey = `IsolationConstrMaterials:${trimmed}`;
  const targetBase = env.calcServiceUrl.replace(/\/$/, "");
  const path = `/api/v1/IsolationConstrMaterials/${encodeURIComponent(trimmed)}`;

  try {
    const cached = await fetchUpstreamCached(cacheKey, async () => {
      const upstream = await fetch(`${targetBase}${path}`, {
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

    if (cached.status >= 400 || cached.body.length === 0) return [];

    let payload: unknown = null;
    try {
      payload = JSON.parse(cached.body.toString("utf-8"));
    } catch {
      return [];
    }

    const names: string[] = [];
    for (const row of parseMaterialsArray(payload)) {
      if (!row || typeof row !== "object") continue;
      const hasIdentity = row.code ?? row.Code ?? row.name ?? row.Name;
      if (hasIdentity == null) continue;
      const name =
        typeof row.Name === "string"
          ? row.Name.trim()
          : typeof row.name === "string"
            ? row.name.trim()
            : "";
      if (name) names.push(name);
    }
    return names;
  } catch {
    return [];
  }
};
