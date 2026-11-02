import { IdleSessionController as SharedIdleSessionController } from "@joint/identity-runtime";
import { isRetryableStatusError } from "../../events/status-subscription";

export class IdleSessionController extends SharedIdleSessionController {
  constructor(
    operations: ConstructorParameters<typeof SharedIdleSessionController>[0],
  ) {
    super(operations, isRetryableStatusError);
  }
}
