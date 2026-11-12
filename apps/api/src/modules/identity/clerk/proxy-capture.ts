type BoundCredential = {
  subject: string;
  sessionId: string;
  totpEnrolled: boolean;
};
type Candidate = { subject: string; sessionId: string; token: string };

/** Retain a successful response only while bounded, synchronous persistence is attempted. */
export async function captureProxyTotp<T extends BoundCredential>(input: {
  action: "sign-in" | "enrollment";
  candidate: Candidate;
  operationId: string;
  verifiedAt: number;
  verify: (token: string) => Promise<T>;
  complete: (input: {
    operationId: string;
    credential: T;
    verifiedAt: number;
  }) => Promise<void>;
  status: (input: { operationId: string; credential: T }) => Promise<boolean>;
}): Promise<void> {
  let credential: T;
  try {
    credential = await input.verify(input.candidate.token);
  } catch {
    return;
  }
  if (
    !credential.totpEnrolled ||
    credential.subject !== input.candidate.subject ||
    credential.sessionId !== input.candidate.sessionId
  )
    return;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await input.complete({
        operationId: input.operationId,
        credential,
        verifiedAt: input.verifiedAt,
      });
      return;
    } catch {
      try {
        if (await input.status({ operationId: input.operationId, credential }))
          return;
      } catch {
        // A retry uses the same operation and original verification time.
      }
    }
  }
}
