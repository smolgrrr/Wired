export function auditSampleCount(): number {
  return process.env.RELAY_AUDIT_OUTPUT === "1" ? 20 : 1;
}

export function summarizeSamples(samples: readonly number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (value: number) =>
    sorted[Math.ceil((value / 100) * sorted.length) - 1] ?? 0;
  return {
    p50: percentile(50),
    p95: percentile(95),
    samples,
  };
}

export function emitAuditMeasurement(value: object): void {
  if (process.env.RELAY_AUDIT_OUTPUT === "1") {
    console.info(JSON.stringify(value));
  }
}
