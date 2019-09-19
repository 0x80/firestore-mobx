type Fn = (...args: any[]) => void;

export function executeFromCount(fn: Fn, count: number) {
  let executionCount = 0;

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
