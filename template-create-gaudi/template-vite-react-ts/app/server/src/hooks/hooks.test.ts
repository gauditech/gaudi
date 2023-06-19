import { testFn } from "./hooks";

test("returns the same value", () => {
  const value = "asdf";

  const retValue = testFn(value);

  expect(retValue).toBe(value);
});
