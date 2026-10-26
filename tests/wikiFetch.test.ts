import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('the shared Wiki reader used by content builders', () => {
  it('preserves wikitext, follows redirects and keeps sequential requests throttled', async () => {
    const times: number[] = [];
    const fetcher = vi.fn(async () => { times.push(Date.now()); return response({ parse: { wikitext: '{{Infobox|value=raw}}' } }); });
    vi.stubGlobal('fetch', fetcher);
    const { wikitext } = await import('../scripts/wiki');
    const run = async () => [await wikitext('A page'), await wikitext('Another page')];
    const result = run();
    await vi.runAllTimersAsync();
    expect(await result).toEqual(['{{Infobox|value=raw}}', '{{Infobox|value=raw}}']);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(400);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get('redirects')).toBe('1');
    expect(new URL(url).searchParams.get('page')).toBe('A page');
    expect(options.headers).toHaveProperty('User-Agent');
  });
  it('retries rate limits and server errors while preserving the successful response', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({}, 429)).mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({ parse: { wikitext: 'verified source' } }));
    vi.stubGlobal('fetch', fetcher);
    const { wikitext } = await import('../scripts/wiki');
    const result = wikitext('Source');
    await vi.runAllTimersAsync();
    expect(await result).toBe('verified source');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('does not endlessly retry a permanent HTTP failure', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({}, 404));
    vi.stubGlobal('fetch', fetcher);
    const { wikitext } = await import('../scripts/wiki');
    const check = expect(wikitext('Missing')).rejects.toThrow('Missing: 404');
    await vi.runAllTimersAsync();
    await check;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not turn a Wiki API error into an empty source', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: { info: 'page unavailable' } })));
    const { wikitext } = await import('../scripts/wiki');
    const check = expect(wikitext('Missing')).rejects.toThrow('Missing: page unavailable');
    await vi.runAllTimersAsync();
    await check;
  });
});
