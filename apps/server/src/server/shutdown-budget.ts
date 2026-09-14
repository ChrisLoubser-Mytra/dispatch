/**
 * Shutdown has to finish inside the service manager's stop timeout. systemd
 * defaults to TimeoutStopSec=90 and launchd to 20s; overrunning either ends
 * in SIGKILL, a `failed` unit, and — because an in-place update restarts the
 * service — an update that never reports back. Every step of the graceful
 * path therefore draws from one shared budget instead of owning an
 * independent timeout that can stack with its neighbours.
 */

export type ShutdownBudget = {
  /** Milliseconds left in the overall budget. */
  remainingMs: () => number;
  /**
   * A step's own preferred budget, capped by what is left overall. A step
   * that wants 10s gets 10s when shutdown has just started and 0 when the
   * budget is already spent.
   */
  forStep: (preferredMs: number) => number;
};

export function createShutdownBudget(
  totalMs: number,
  now: () => number = Date.now
): ShutdownBudget {
  const startedAt = now();
  const remainingMs = () => Math.max(0, totalMs - (now() - startedAt));
  return {
    remainingMs,
    forStep: (preferredMs) => Math.min(preferredMs, remainingMs()),
  };
}

export type ShutdownStepLogger = (
  details: { step: string; budgetMs: number },
  message: string
) => void;

/**
 * Await `work`, giving up after `budgetMs`. Resolves to `null` on timeout or
 * rejection so a stuck or failing step can never strand the ones behind it —
 * shutdown is best-effort by definition, and the process is about to exit.
 */
export async function withShutdownDeadline<T>(
  work: Promise<T>,
  budgetMs: number,
  step: string,
  log?: ShutdownStepLogger
): Promise<T | null> {
  const settled = work.catch(() => null);
  if (budgetMs <= 0) {
    log?.({ step, budgetMs }, "Shutdown budget exhausted before step");
    return null;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      log?.({ step, budgetMs }, "Shutdown step exceeded its budget");
      resolve(null);
    }, budgetMs);
  });

  try {
    return await Promise.race([settled, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
