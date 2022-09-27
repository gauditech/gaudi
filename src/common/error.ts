import { Interval } from "ohm-js";

export type WithContext<T> = { interval?: Interval } & T;

export class CompilerError extends Error {
  constructor(message: string, context?: WithContext<unknown>) {
    if (!context?.interval) {
      super("Unknown source position!\n" + message);
    } else {
      super(context.interval.getLineAndColumnMessage() + "message");
    }
  }
}
