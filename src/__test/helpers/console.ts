import util from 'util'

export function consoleInspect(label: string, value: {}) {
  console.log(label, util.inspect(value, false, null, true));
}
