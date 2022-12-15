/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function assert(condition: any, msg: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}

import { customAlphabet } from "nanoid";

const ID_SIZE = 8;
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, ID_SIZE);

export function createUniqueId() {
  return nanoid();
}

export function first<T>(array: T[]): T | undefined {
  return array[0];
}

export function last<T>(array: T[]): T | undefined {
  return array[array.length - 1];
}

/**
 * Idea taken from https://kentcdodds.com/blog/get-a-catch-block-error-message-with-typescript?ck_subscriber_id=553154891
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
     * fallback in case there’s an error stringifying the maybeError
     * like with circular references for example.
     */
    return new Error(String(maybeError));
  }
}

export function getErrorMessage(error: unknown) {
  return toErrorWithMessage(error).message;
}
