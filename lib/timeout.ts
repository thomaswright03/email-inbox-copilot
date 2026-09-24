// Bounded waits for calls to Gmail and Gemini. A call that doesn't answer
// in time fails with a TimeoutError, which lib/retry.ts treats as transient
// (retried within its budget) like any other network timeout.

export class TimeoutError extends Error {
  readonly code = "ETIMEDOUT";
  constructor(ms: number) {
    super(`Timed out after ${ms} ms`);
    this.name = "TimeoutError";
  }
}

// An AbortSignal that fires after `ms` with a TimeoutError: a deadline
// shared by several calls. Its timer doesn't keep the process alive.
export function deadlineSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TimeoutError(ms)), ms);
  (timer as { unref?: () => void }).unref?.();
  return controller.signal;
}

// Runs `fn` with a signal that aborts after `ms` or when `parent` aborts,
// whichever comes first, and settles at that moment with the abort reason,
// even if `fn` ignores its signal.
export function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const fail = (reason: unknown) => {
      cleanup();
      controller.abort(reason);
      reject(reason);
    };
    const onParentAbort = () => fail(parent?.reason ?? new TimeoutError(ms));
    const timer = setTimeout(() => fail(new TimeoutError(ms)), ms);
    function cleanup() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    }
    if (parent?.aborted) {
      onParentAbort();
      return;
    }
    parent?.addEventListener("abort", onParentAbort, { once: true });
    let pending: Promise<T>;
    try {
      pending = Promise.resolve(fn(controller.signal));
    } catch (err) {
      cleanup();
      reject(err);
      return;
    }
    pending.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (err) => {
        cleanup();
        reject(err);
      }
    );
  });
}
