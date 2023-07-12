export type Iterator = {
  /** Value of current iteration */
  current: number;
  /** Total number of possible iterations */
  total: number;
};

/**
 * Create iterator generator fn which returns `Iterator` with every iteration.
 *
 * This is a JS generator function which means it can be directly used with
 * `for of`, `forEach` and similar iteration constructs
 *
 * Eg.
 * ```
 * for(let iter of createIterator(1, 5)) {
 *   console.log("Value:" + iter.current)
 * }
 * ```
 */
export function* createIterator(start: number, end: number): Generator<Iterator, void, void> {
  let current = start;
  const total = end - start + 1;

  for (let i = 0; i < total; i++) {
    yield { current, total };
    current++;
  }
}
