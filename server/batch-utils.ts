/** Keep each D1 statement below its bound-parameter limit. */
export function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

/** Wait for all workers even after a failure; never leave detached upstream requests. */
export async function mapLimited<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = await Promise.allSettled(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) { const i = cursor++; results[i] = await run(items[i]); }
  }));
  const failed = workers.find(r => r.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return results;
}
