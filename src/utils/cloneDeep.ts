export function cloneDeep<T>(value: T): T {
  if (typeof value === 'undefined') {
    return value as T;
  }

  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  } else {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
