import {
  resolveClerkSessionToken,
  sessionAuthorization,
} from "../../../lib/server/clerk-session";
import { cookies } from "next/headers";
import {
  bootstrapSchema,
  meResponseSchema,
  readAuthProvider,
  readEnvironment,
  webEnvironmentSchema,
} from "@joint/contracts";

export async function GET(): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  let mode: "local" | "clerk";
  try {
    mode = readAuthProvider(process.env);
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
  if (mode === "clerk") {
    try {
      const token = await resolveClerkSessionToken();
      const env = readEnvironment(webEnvironmentSchema, process.env);
      const response = await fetch(new URL("/v1/me", env.API_BASE_URL), {
        headers: { Authorization: sessionAuthorization(token) },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(3000),
      });
      if (response.status === 401)
        return Response.json(
          { status: "unauthorized" },
          { status: 401, headers },
        );
      if (!response.ok) throw new Error("Bootstrap unavailable");
      const identity = meResponseSchema.parse(await response.json());
      if (!identity.membership)
        return Response.json(
          { status: "unauthorized" },
          { status: 401, headers },
        );
      return Response.json(
        bootstrapSchema.parse({
          status: "ok",
          householdId: identity.membership.householdId,
        }),
        { headers },
      );
    } catch {
      return Response.json({ status: "unavailable" }, { status: 503, headers });
    }
  }
  const jar = await cookies();
  const token =
    jar.get("__Host-joint-access")?.value ?? jar.get("joint-access")?.value;
  if (!token)
    return Response.json({ status: "unauthorized" }, { status: 401, headers });
  try {
    const env = readEnvironment(webEnvironmentSchema, process.env);
    const result = await fetch(new URL("/v1/bootstrap", env.API_BASE_URL), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    if (result.status === 401)
      return Response.json(
        { status: "unauthorized" },
        { status: 401, headers },
      );
    if (!result.ok) throw new Error("Bootstrap unavailable");
    return Response.json(bootstrapSchema.parse(await result.json()), {
      headers,
    });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
