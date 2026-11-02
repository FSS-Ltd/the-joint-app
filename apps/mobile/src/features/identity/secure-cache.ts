type SecureTokenCache = {
  getToken(key: string): Promise<string | null | undefined>;
  saveToken(key: string, value: string): Promise<void>;
  clearToken?(key: string): void | Promise<void>;
};
/** Keep storage failures observable without logging credentials or native error payloads. */
export function guardTokenCache(
  cache: SecureTokenCache,
  failed: () => void,
): SecureTokenCache {
  async function protect<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      failed();
      throw new Error("Secure session storage is unavailable.");
    }
  }
  return {
    getToken: (key) => protect(() => cache.getToken(key)),
    saveToken: (key, value) => protect(() => cache.saveToken(key, value)),
    clearToken: (key) =>
      protect(async () => {
        await cache.clearToken?.(key);
      }),
  };
}
