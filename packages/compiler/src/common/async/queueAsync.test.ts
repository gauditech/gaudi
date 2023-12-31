import * as FakeTimers from "@sinonjs/fake-timers";

import { createAsyncQueueContext } from "@compiler/common/async/queueAsync";

const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));

function createAsyncFn(value: number, timeout: number) {
  return async () => {
    return sleep(timeout).then(() => value);
  };
}

describe("queue async", () => {
  let clock: FakeTimers.InstalledClock;
  beforeEach(() => {
    if (clock) throw new Error("Clock already set!");

    clock = FakeTimers.install();
  });
  afterEach(() => {
    if (!clock) throw new Error("Clock is not yet set!");

    clock.uninstall();
    clock = null as never;
  });

  it("should resolve a single enqueued promise", async () => {
    const callbackFn = jest.fn();

    const queue = createAsyncQueueContext();

    queue(async () => {
      createAsyncFn(1, 20)().then(callbackFn);
    });

    await clock.tickAsync(20); // wait until promise finishes

    expect(callbackFn).toBeCalledTimes(1);
    expect(callbackFn).toBeCalledWith(1);
  });

  it("should resolve all enqueued promises", async () => {
    const callbackFn = jest.fn();

    const queue = createAsyncQueueContext();

    // NOTE: enqueue 3 promises so that one is always enqueued but without overwriting the previous one

    queue(async () => createAsyncFn(1, 20)().then(callbackFn));
    await clock.tickAsync(10); // somewhere BEFORE the end of async fn1

    queue(async () => createAsyncFn(2, 20)().then(callbackFn));
    await clock.tickAsync(30); // somewhere BEFORE the end of async fn2

    queue(async () => createAsyncFn(3, 20)().then(callbackFn));
    await clock.tickAsync(41); // somewhere AFTER the end of async fn3

    expect(callbackFn).toHaveBeenNthCalledWith(1, 1);
    expect(callbackFn).toHaveBeenNthCalledWith(2, 2);
    expect(callbackFn).toHaveBeenNthCalledWith(3, 3);
    expect(callbackFn).toBeCalledTimes(3);
  });

  it("should resolve all sequential promises", async () => {
    const callbackFn = jest.fn();

    const queue = createAsyncQueueContext();

    // NOTE: enqueue 3 promises so that none is enqueued

    queue(async () => createAsyncFn(1, 20)().then(callbackFn));
    await clock.tickAsync(21); // somewhere AFTER the end of async fn1

    queue(async () => createAsyncFn(2, 20)().then(callbackFn));
    await clock.tickAsync(21); // somewhere AFTER the end of async fn2

    queue(async () => createAsyncFn(3, 20)().then(callbackFn));
    await clock.tickAsync(21); // somewhere AFTER the end of async fn3

    expect(callbackFn).toHaveBeenNthCalledWith(1, 1);
    expect(callbackFn).toHaveBeenNthCalledWith(2, 2);
    expect(callbackFn).toHaveBeenNthCalledWith(3, 3);
    expect(callbackFn).toBeCalledTimes(3);
  });

  it("should resolve only the first and the third promise", async () => {
    const callbackFn = jest.fn();

    const queue = createAsyncQueueContext();

    // NOTE: enqueue 3 promises but overwrite the second one

    queue(async () => createAsyncFn(1, 20)().then(callbackFn));
    await clock.tickAsync(10); // somewhere BEFORE the end of async fn1

    // this one should be overwritten
    queue(async () => createAsyncFn(2, 20)().then(callbackFn));
    await clock.tickAsync(5); // BEFORE the end of fn1 (the first function!)

    queue(async () => createAsyncFn(3, 20)().then(callbackFn));
    await clock.tickAsync(30); // somewhere AFTER the end of async fn3

    expect(callbackFn).toHaveBeenNthCalledWith(1, 1);
    expect(callbackFn).toHaveBeenNthCalledWith(2, 3);
    expect(callbackFn).toBeCalledTimes(2);
  });
});
