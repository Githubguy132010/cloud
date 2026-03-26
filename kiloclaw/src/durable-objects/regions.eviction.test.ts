import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evictCapacityRegionFromKV, FLY_REGIONS_KV_KEY } from './regions';

function makeKv(initialValue: string | null = null): {
  store: Map<string, string>;
  kv: KVNamespace;
} {
  const store = new Map<string, string>();
  if (initialValue !== null) {
    store.set(FLY_REGIONS_KV_KEY, initialValue);
  }
  const kv = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
  return { store, kv };
}

const noopEnv: { KILOCLAW_AE?: AnalyticsEngineDataset } = {};

describe('evictCapacityRegionFromKV', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('is a no-op when KV read fails (no throw)', async () => {
    const kv = {
      get: vi.fn().mockRejectedValue(new Error('KV unavailable')),
      put: vi.fn(),
    } as unknown as KVNamespace;

    await expect(evictCapacityRegionFromKV(kv, noopEnv, 'iad')).resolves.toBeUndefined();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('is a no-op when KV key is null', async () => {
    const { kv } = makeKv(null);
    await evictCapacityRegionFromKV(kv, noopEnv, 'iad');
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('is a no-op when KV key is empty string', async () => {
    const { kv } = makeKv('');
    await evictCapacityRegionFromKV(kv, noopEnv, 'iad');
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('is a no-op for a pure meta-region list', async () => {
    const { kv } = makeKv('eu,us');
    await evictCapacityRegionFromKV(kv, noopEnv, 'eu');
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('is a no-op when failedRegion is not in the list', async () => {
    const { kv } = makeKv('iad,dfw,ord');
    await evictCapacityRegionFromKV(kv, noopEnv, 'lhr');
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('evicts one region from a list with multiple remaining named regions', async () => {
    const { kv, store } = makeKv('iad,dfw,ord');
    await evictCapacityRegionFromKV(kv, noopEnv, 'iad');
    expect(kv.put).toHaveBeenCalledWith(FLY_REGIONS_KV_KEY, 'dfw,ord');
    expect(store.get(FLY_REGIONS_KV_KEY)).toBe('dfw,ord');
  });

  it('deduplicates before writing when evicting from a list with duplicates', async () => {
    const { kv } = makeKv('iad,dfw,iad,ord');
    await evictCapacityRegionFromKV(kv, noopEnv, 'iad');
    // remaining after evicting both iad occurrences: dfw,ord (deduplicated)
    expect(kv.put).toHaveBeenCalledWith(FLY_REGIONS_KV_KEY, 'dfw,ord');
  });

  it('writes "lastRegion,eu,us" when evicting the second-to-last named region', async () => {
    const { kv, store } = makeKv('iad,dfw');
    await evictCapacityRegionFromKV(kv, noopEnv, 'iad');
    expect(kv.put).toHaveBeenCalledWith(FLY_REGIONS_KV_KEY, 'dfw,eu,us');
    expect(store.get(FLY_REGIONS_KV_KEY)).toBe('dfw,eu,us');
  });

  it('writes "failedRegion,eu,us" when evicting the only named region', async () => {
    const { kv, store } = makeKv('iad');
    await evictCapacityRegionFromKV(kv, noopEnv, 'iad');
    expect(kv.put).toHaveBeenCalledWith(FLY_REGIONS_KV_KEY, 'iad,eu,us');
    expect(store.get(FLY_REGIONS_KV_KEY)).toBe('iad,eu,us');
  });

  it('writes "failedRegion,eu,us" when evicting the only named region mixed with meta-regions', async () => {
    // iad is the only named region, eu is meta — after evicting iad, no named regions remain
    const { kv } = makeKv('iad,eu');
    await evictCapacityRegionFromKV(kv, noopEnv, 'iad');
    expect(kv.put).toHaveBeenCalledWith(FLY_REGIONS_KV_KEY, 'iad,eu,us');
  });

  it('logs a warning after a successful eviction', async () => {
    const { kv } = makeKv('iad,dfw,ord');
    await evictCapacityRegionFromKV(kv, noopEnv, 'iad');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[regions] capacity eviction: removed iad')
    );
  });

  it('logs a revert-to-meta warning when last named region is evicted', async () => {
    const { kv } = makeKv('iad');
    await evictCapacityRegionFromKV(kv, noopEnv, 'iad');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('reverting to meta-regions')
    );
  });

  it('emits analytics event when KILOCLAW_AE binding is present', async () => {
    const writeDataPoint = vi.fn();
    const env = {
      KILOCLAW_AE: { writeDataPoint } as unknown as AnalyticsEngineDataset,
    };
    const { kv } = makeKv('iad,dfw,ord');
    await evictCapacityRegionFromKV(kv, env, 'iad');
    expect(writeDataPoint).toHaveBeenCalledOnce();
    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[0]).toBe('region.capacity_eviction');
    expect(call.blobs[11]).toBe('iad'); // flyRegion
    expect(call.blobs[12]).toBe('evicted'); // label
  });

  it('emits "reverted_to_meta" label in analytics when last named region evicted', async () => {
    const writeDataPoint = vi.fn();
    const env = {
      KILOCLAW_AE: { writeDataPoint } as unknown as AnalyticsEngineDataset,
    };
    const { kv } = makeKv('iad');
    await evictCapacityRegionFromKV(kv, env, 'iad');
    expect(writeDataPoint).toHaveBeenCalledOnce();
    const call = writeDataPoint.mock.calls[0][0];
    expect(call.blobs[12]).toBe('reverted_to_meta'); // label
  });

  it('does not throw and logs a warning when KV put fails', async () => {
    const kv = {
      get: vi.fn().mockResolvedValue('iad,dfw'),
      put: vi.fn().mockRejectedValue(new Error('KV write error')),
    } as unknown as KVNamespace;

    await expect(evictCapacityRegionFromKV(kv, noopEnv, 'iad')).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to write updated region list to KV')
    );
  });

  it('does not emit analytics when KV put fails', async () => {
    const writeDataPoint = vi.fn();
    const env = {
      KILOCLAW_AE: { writeDataPoint } as unknown as AnalyticsEngineDataset,
    };
    const kv = {
      get: vi.fn().mockResolvedValue('iad,dfw'),
      put: vi.fn().mockRejectedValue(new Error('KV write error')),
    } as unknown as KVNamespace;

    await evictCapacityRegionFromKV(kv, env, 'iad');
    expect(writeDataPoint).not.toHaveBeenCalled();
  });
});
