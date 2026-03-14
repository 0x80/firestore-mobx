export function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}

export function createId(): string {
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

export function first<T>(array: T[]): T | undefined {
  return array[0];
}

export function last<T>(array: T[]): T | undefined {
  return array[array.length - 1];
}

/**
 * Idea taken from
 * https://kentcdodds.com/blog/get-a-catch-block-error-message-with-typescript?ck_subscriber_id=553154891
 */

type ErrorWithMessage = {
  message: string;
};

export function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return typeof error === "object" && error !== null && "message" in error;
}

function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
  if (isErrorWithMessage(maybeError)) return maybeError;

  try {
    return new Error(JSON.stringify(maybeError));
  } catch {
    /**
     * Fallback in case there's an error stringifying the maybeError like with
     * circular references for example.
     */
    return new Error(String(maybeError));
  }
}

export function getErrorMessage(error: unknown) {
  return toErrorWithMessage(error).message;
}
