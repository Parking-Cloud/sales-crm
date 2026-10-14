// Calls a server action from the browser without ever throwing: a network
// error, a gateway timeout (504) or no answer within the time limit become
// an error result with a message, so the page never goes blank.

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

export const TIMEOUT_MESSAGE =
  "Il file è troppo grande o il server non ha risposto in tempo. Riprova o dividi il file.";

// Just over the server limit, so a real 504 arrives first when there is one.
const TIMEOUT_MS = 35_000;

export async function safeCall<T>(call: () => Promise<ActionResult<T>>, timeoutMs = TIMEOUT_MS): Promise<ActionResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    const result = await Promise.race([call(), timeout]);
    // A missing or malformed answer counts as no answer.
    return result && typeof result === "object" && "ok" in result ? result : { ok: false, message: TIMEOUT_MESSAGE };
  } catch {
    return { ok: false, message: TIMEOUT_MESSAGE };
  } finally {
    clearTimeout(timer);
  }
}
