export type IdentityConfiguration = {
  publishableKey: string;
  apiUrl: string;
  authReturnUrl?: string;
};
export function readIdentityConfiguration(
  values: {
    publishableKey?: string;
    apiUrl?: string;
    authReturnUrl?: string;
    allowLocalHttp?: string;
  },
  development: boolean,
):
  | { kind: "configured"; value: IdentityConfiguration }
  | { kind: "unconfigured" } {
  try {
    const key = values.publishableKey ?? "";
    if (!/^pk_(test|live)_[A-Za-z0-9+/]+=*$/.test(key)) throw new Error();
    const host = atob(key.slice(8));
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+\$$/.test(host)) throw new Error();
    const api = new URL(values.apiUrl ?? "");
    const localHttp =
      development &&
      key.startsWith("pk_test_") &&
      values.allowLocalHttp === "true" &&
      ["127.0.0.1", "localhost", "10.0.2.2"].includes(api.hostname);
    if (
      (api.protocol !== "https:" && !(api.protocol === "http:" && localHttp)) ||
      api.username ||
      api.password ||
      api.search ||
      api.hash ||
      api.pathname !== "/"
    )
      throw new Error();
    if (
      values.authReturnUrl &&
      values.authReturnUrl !== "familyfund://auth-return"
    )
      throw new Error();
    return {
      kind: "configured",
      value: {
        publishableKey: key,
        apiUrl: api.origin,
        ...(values.authReturnUrl
          ? { authReturnUrl: values.authReturnUrl }
          : {}),
      },
    };
  } catch {
    return { kind: "unconfigured" };
  }
}
