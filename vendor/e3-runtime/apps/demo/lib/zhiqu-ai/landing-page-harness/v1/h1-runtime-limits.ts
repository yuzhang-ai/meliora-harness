export const H1_RUNTIME_EXECUTION_LIMITS_V1 = Object.freeze({
  // A Capture Grant is a short-lived, single-use admission credential. Once
  // consumed into one immutable Run, execution has its own bounded lifetime.
  maxRunWallTimeMs: 120_000,
  // Must exceed SQLite's 5 second contention wait. Otherwise a healthy
  // worker can lose its claim merely because another process is committing.
  maximumClaimLeaseMs: 15_000,
  maximumHeartbeatMs: 3_000,
} as const);

export const h1RuntimeExecutionExpiresAtV1 = (input: Readonly<{
  activatedAt: string;
  hostExpiresAt: string;
}>) =>
  new Date(
    Math.min(
      Date.parse(input.activatedAt) +
        H1_RUNTIME_EXECUTION_LIMITS_V1.maxRunWallTimeMs,
      Date.parse(input.hostExpiresAt)
    )
  ).toISOString();
