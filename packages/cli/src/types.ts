/**
 * Something that can be runned or stopped like eg. resource watcher.
 */
export type Controllable = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};
