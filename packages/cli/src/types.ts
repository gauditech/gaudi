/**
 * Something that can be stopped like eg. resource watcher.
 *
 * We should add "start" if we need to have control over starting (eg. do it later/elsewhere).
 */
export type Stoppable = {
  stop: () => Promise<void>;
};
