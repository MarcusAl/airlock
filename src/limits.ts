const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export const LIMITS = {
  hook: {
    timeoutSeconds: 120,
    lockWaitMs: 5 * SECOND,
    dockerMs: 10 * SECOND,
  },
  tripwire: {
    maxEntries: 200_000,
    deadlineMs: 15 * SECOND,
    lockWaitMs: 30 * SECOND,
  },
  docker: {
    quickMs: 60 * SECOND,
    slowMs: 15 * MINUTE,
    cloneMs: 10 * MINUTE,
  },
  git: {
    ms: 60 * SECOND,
  },
  lock: {
    waitMs: 60 * SECOND,
    retryMs: 100,
    freshMs: 2 * SECOND,
  },
  gateway: {
    healthChecks: 5,
    healthIntervalMs: 200,
  },
  ports: {
    attempts: 20,
    retryMs: 150,
  },
  process: {
    killAfterMs: 10 * SECOND,
  },
} as const;

const PAUSE_AND_UNPAUSE = 2;
const SCAN_PASSES = 2;

export const hookWorstCaseMs = (): number =>
  SCAN_PASSES * LIMITS.tripwire.deadlineMs +
  LIMITS.hook.lockWaitMs +
  PAUSE_AND_UNPAUSE * LIMITS.hook.dockerMs;
