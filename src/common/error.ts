export type WithContext<T> = { interval?: "" } & T;

export class CompilerError extends Error {
  constructor(message: string, _context?: WithContext<unknown>) {
    super("Unknown source position!\n" + message);
  }
}
