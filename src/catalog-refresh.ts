// Keep the last successful directory when a refresh fails. Ignore responses
// from an older request after a newer request has started.
export function createCatalogRefresher<T>(load: () => Promise<T[] | null | undefined>, publish: (value: T[]) => void, ready: () => void) {
  let sequence = 0;
  return async () => {
    const current = ++sequence;
    try {
      const value = await load();
      if (current === sequence && value?.length) publish(value);
    } catch { /* The current catalog remains usable during an outage. */ }
    finally { if (current === sequence) ready(); }
  };
}
