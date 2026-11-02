/** SDK owns the OAuth exchange. This guard only authorizes a pending app return. */
export class NativeReturnGuard {
  private pendingUntil: number | null = null;
  constructor(
    private readonly destination: string,
    private readonly now = Date.now,
  ) {}
  begin(): void {
    this.pendingUntil = this.now() + 600_000;
  }
  cancel(): void {
    this.pendingUntil = null;
  }
  consume(value: string): boolean {
    const until = this.pendingUntil;
    this.cancel();
    if (until === null || this.now() >= until || value.length > 4096)
      return false;
    try {
      const url = new URL(value);
      const target = new URL(this.destination);
      return (
        url.protocol === target.protocol &&
        url.host === target.host &&
        url.pathname === target.pathname &&
        !url.username &&
        !url.password &&
        !url.hash &&
        url.searchParams.size === 1 &&
        url.searchParams.getAll("rotating_token_nonce").length === 1 &&
        /^[A-Za-z0-9_-]{1,2048}$/.test(
          url.searchParams.get("rotating_token_nonce") ?? "",
        )
      );
    } catch {
      return false;
    }
  }
}
export function readInvitationLink(value: string): string | null {
  try {
    if (value.length > 256) return null;
    const url = new URL(value);
    const token = url.searchParams.get("token");
    if (
      url.protocol !== "familyfund:" ||
      url.host !== "invitation" ||
      url.pathname !== "" ||
      url.username ||
      url.password ||
      url.hash ||
      url.searchParams.size !== 1 ||
      !token ||
      !/^[A-Za-z0-9_-]{43}$/.test(token)
    )
      return null;
    return token;
  } catch {
    return null;
  }
}
