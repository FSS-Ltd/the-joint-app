import {
  statusSubscriptionSchema,
  type StatusSubscription,
} from "@joint/contracts";
import { RequestError } from "../identity/client";

export function statusPath(selector: StatusSubscription): string {
  const parsed = statusSubscriptionSchema.safeParse(selector);
  if (!parsed.success)
    throw new RequestError("This status is unavailable.", 400);
  const value = parsed.data;
  if (value.kind === "deletion")
    return `/api/privacy/deletion-requests/${value.id}/events`;
  return `/api/events?${new URLSearchParams(value)}`;
}
