const codes = new Set([
  "API_REQUEST_REJECTED",
  "WORKER_JOB_FAILED",
  "EXPORT_STREAM_FAILED",
  "PRIVACY_PROVIDER_PENDING",
  "UNAVAILABLE",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Construct a new allowlisted event; never serialize errors, headers or payloads. */
export function diagnosticLine(value: unknown): string {
  const event: Record<string, string | number> = { code: "UNAVAILABLE" };
  if (typeof value !== "object" || value === null)
    return JSON.stringify(event) + "\n";
  try {
    const code: unknown = Reflect.get(value, "code");
    if (typeof code === "string" && codes.has(code)) event.code = code;
    for (const key of ["requestId", "jobId", "auditId"]) {
      const id: unknown = Reflect.get(value, key);
      if (typeof id === "string" && uuid.test(id)) event[key] = id;
    }
    const status: unknown = Reflect.get(value, "status");
    if (
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
    )
      event.status = status;
  } catch {
    return '{"code":"UNAVAILABLE"}\n';
  }
  return JSON.stringify(event) + "\n";
}
