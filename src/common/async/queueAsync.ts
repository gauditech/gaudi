/**
 * Creates context for executing promises in queue
 *
 * When the first async is given it is executed right away.
 * If the previous async has not yet finished, the new one is stored for executing
 * after the active one finishes. If next callback already exists, the new one
 * overrides the previous one
 *
 * Current "queue" size is 1 but it could easily be modified to allow queue size >1.
 */
export function createAsyncQueueContext() {
  // currently active promise - empty after promise finishes (and there is no next one to execute)
  let currentPromise: Promise<any> | undefined;
  // callback which should return the next promise to execute - empty if there is no next
  // new callback will replace the one that is waiting so only the last one added will ne executed after
  // current promise finishes
  let nextCallback: (<T>() => Promise<T>) | undefined;

  return (cb: () => Promise<any>) => {
    // previous promise is allready active
    // schedule callback for execution
    if (currentPromise != null) {
      nextCallback = cb;
    }
    // no active promise
    else {
      const attachNextCb = (value: any) => {
        // next callback available
        if (nextCallback) {
          // create the next promise and attach the next-next callback once it finishes
          currentPromise = nextCallback().then(attachNextCb);
          nextCallback = undefined; // clear current callback (so it doesn't get executed again)
        }
        // nothing to do, clear both values
        else {
          currentPromise = undefined;
          nextCallback = undefined;
        }

        return value;
      };

      currentPromise = cb().then(attachNextCb);
    }

    return currentPromise;
  };
}
