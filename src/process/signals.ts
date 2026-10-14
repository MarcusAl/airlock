const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

export const ignoringSignals = async <T>(work: () => Promise<T>): Promise<T> => {
  const ignore = () => {};
  for (const signal of SIGNALS) process.on(signal, ignore);
  try {
    return await work();
  } finally {
    for (const signal of SIGNALS) process.off(signal, ignore);
  }
};
