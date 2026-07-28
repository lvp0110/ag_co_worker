type CachedResponse = {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  expiresAt: number;
};

const store = new Map<string, CachedResponse>();
const inflight = new Map<string, Promise<CachedResponse>>();

const MAX_ENTRIES = 32;

const evictIfNeeded = (): void => {
  if (store.size <= MAX_ENTRIES) return;
  const oldestKey = store.keys().next().value;
  if (oldestKey) store.delete(oldestKey);
};

export const getUpstreamCacheTtlMs = (): number => {
  const raw = process.env.CALC_UPSTREAM_CACHE_TTL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10 * 60 * 1000;
};

/**
 * In-memory cache для тяжёлых GET-прокси (прайс, каталог конструкций).
 * Один процесс backend — достаточно для снижения нагрузки на dev3 и ускорения UI.
 */
export const fetchUpstreamCached = async (
  cacheKey: string,
  fetcher: () => Promise<Omit<CachedResponse, "expiresAt">>
): Promise<CachedResponse> => {
  const now = Date.now();
  const hit = store.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit;

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const ttlMs = getUpstreamCacheTtlMs();
  const promise = fetcher()
    .then((fresh) => {
      const entry: CachedResponse = { ...fresh, expiresAt: now + ttlMs };
      store.set(cacheKey, entry);
      evictIfNeeded();
      inflight.delete(cacheKey);
      return entry;
    })
    .catch((err) => {
      inflight.delete(cacheKey);
      throw err;
    });

  inflight.set(cacheKey, promise);
  return promise;
};
