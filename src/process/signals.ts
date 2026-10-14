const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
const INTERRUPTED = 130;

export const ignoringSignals = async <T>(work: () => Promise<T>): Promise<T> => {
  let received = 0;
  const onSignal = () => {
    received++;
    if (received > 1) {
      process.stderr.write("airlock: interrupted; the workspace was not fully checked\n");
      process.exit(INTERRUPTED);
    }
  };
  for (const signal of SIGNALS) process.on(signal, onSignal);
  try {
    return await work();
  } finally {
    for (const signal of SIGNALS) process.off(signal, onSignal);
  }
};
