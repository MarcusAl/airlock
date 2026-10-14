const url = process.argv[2];
try {
  await fetch(url, { signal: AbortSignal.timeout(8000) });
  process.exit(0);
} catch {
  process.exit(3);
}
