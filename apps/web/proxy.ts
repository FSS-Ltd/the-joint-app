import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import {
  clerkServerEnvironmentSchema,
  clerkWebEnvironmentSchema,
  readAuthProvider,
} from "@joint/contracts";

export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
): Promise<Response | null | void> {
  let mode: "local" | "clerk";
  try {
    mode = readAuthProvider(process.env);
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "UNAVAILABLE",
          message: "Sign-in configuration is unavailable.",
        },
      },
      { status: 503 },
    );
  }
  if (mode === "local") return NextResponse.next();
  const server = clerkServerEnvironmentSchema.safeParse(process.env),
    web = clerkWebEnvironmentSchema.safeParse(process.env);
  // Leave the custom setup state renderable; no keyless provisioning or legacy fallback.
  if (!server.success || !web.success) return NextResponse.next();
  return clerkMiddleware({
    publishableKey: web.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    jwtKey: server.data.CLERK_JWT_KEY,
    authorizedParties: server.data.CLERK_AUTHORIZED_PARTIES,
  })(request, event);
}
export const config = {
  matcher: [
    "/((?!_next|.*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
