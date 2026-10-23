function requireFundingProof(value) {
  if (!value) throw new Error("Restored funding privacy verification failed");
}
export async function verifyRestoredFunding(
  owner,
  scoped,
  archive,
  freshContext,
  fixture,
) {
  const f = fixture.funding;
  const { rows: exclusive } = await owner.query(
    'SELECT id FROM app."FundingEvidence" WHERE "accountId"=$1',
    [fixture.accounts.sole],
  );
  requireFundingProof(exclusive.length === 0);
  const { rows: remaining } = await owner.query(
    'SELECT id,version,"createdAt" FROM app."FundingEvidence" WHERE "accountId"=$1 ORDER BY version',
    [f.accountId],
  );
  requireFundingProof(
    remaining.length === 1 &&
      remaining[0].id === f.original.id &&
      remaining[0].version === 1 &&
      remaining[0].createdAt.toISOString() === f.original.createdAt,
  );
  const context = await freshContext(f.frozen, true);
  const [frozen] = await archive.withScope(
    context,
    (tx) =>
      tx.$queryRaw`SELECT app.read_funding_evidence(${f.accountId}::uuid,0) AS data`,
  );
  requireFundingProof(
    frozen.data.current.id === f.original.id &&
      frozen.data.history.length === 1 &&
      frozen.data.current.billReserves.amountMinor === "15",
  );
  const active = await freshContext(fixture.remaining);
  const [joint] = await scoped.withScope(
    active,
    (tx) =>
      tx.$queryRaw`SELECT app.read_funding_evidence(${fixture.accounts.joint}::uuid,0) AS data`,
  );
  requireFundingProof(
    joint.data.current.id === f.joint.id &&
      joint.data.current.createdAt === f.joint.createdAt &&
      joint.data.history.length === 1,
  );
  return {
    fundingExclusivePurged: true,
    fundingFrozenArchive: true,
    fundingJointRetained: true,
  };
}
