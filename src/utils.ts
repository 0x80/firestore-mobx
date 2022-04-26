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
