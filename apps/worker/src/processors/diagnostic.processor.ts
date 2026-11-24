import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { TransientJobError, type DiagnosticJob, type DiagnosticResult } from "@cloudpilot/queue";

export async function processDiagnosticJob(
  job: Job<DiagnosticJob>,
  signal?: AbortSignal,
): Promise<DiagnosticResult> {
  if (job.data.permanentFailure) {
    throw new UnrecoverableError("Diagnostic permanent failure requested");
  }

  if (job.data.transientFailureOnce && job.attemptsStarted === 1) {
    throw new TransientJobError("Diagnostic transient failure requested");
  }

  if (job.data.blockForMs) {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error("Diagnostic job cancelled"));
        return;
      }
      const timeout = setTimeout(resolve, job.data.blockForMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(timeout);
        reject(signal.reason ?? new Error("Diagnostic job cancelled"));
      }, { once: true });
    });
  }

  if (signal?.aborted) {
    throw signal.reason ?? new Error("Diagnostic job cancelled");
  }

  return {
    kind: "diagnostic",
    correlationId: job.data.correlationId,
    processedAt: new Date().toISOString(),
  };
}
