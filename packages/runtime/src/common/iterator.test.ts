import { createIterator } from "@runtime/common/iterator";

describe("iterator", () => {
  it("should iterate given amount of times", () => {
    const fn = jest.fn();

    const start = 3;
    const end = 6;
    const count = end - start + 1;

    for (const it of createIterator(start, end)) {
      fn(it);
    }

    expect(fn).toBeCalledTimes(count);
    expect(fn).toBeCalledWith({ current: 3, total: 4 });
    expect(fn).toBeCalledWith({ current: 4, total: 4 });
    expect(fn).toBeCalledWith({ current: 5, total: 4 });
    expect(fn).toBeCalledWith({ current: 6, total: 4 });
  });
});
