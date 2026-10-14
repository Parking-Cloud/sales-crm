// Durations in milliseconds of the steps of a server action, logged as one
// JSON line with counts. Never data: only numbers.
export function stopwatch(event: string) {
  const start = performance.now();
  let last = start;
  const steps: Record<string, number> = {};
  return {
    step(name: string) {
      const now = performance.now();
      steps[name] = Math.round(now - last);
      last = now;
    },
    log(counts: Record<string, number>) {
      console.info(JSON.stringify({ evento: event, ms: { ...steps, totale: Math.round(performance.now() - start) }, ...counts }));
    },
  };
}
