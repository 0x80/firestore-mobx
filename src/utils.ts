/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type Fn = (...args: any[]) => void;

export function executeFromCount(fn: Fn, count: number) {
  let executionCount = 0;

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (...args: any[]) => {
    if (executionCount < count) {
      executionCount++;
      return false;
    } else {
      fn(...args);
      return true;
    }
  };
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function assert(condition: any, msg: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}
