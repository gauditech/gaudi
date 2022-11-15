import { RuntimeConfig } from "@src/runtime/config";
import { DbConn } from "@src/runtime/server/dbConn";

export type AppContext = {
  dbConn: DbConn;
  config: Readonly<RuntimeConfig>;
};

let contextInstance: AppContext | undefined;

export function initializeContext(context: AppContext) {
  return (contextInstance = context);
}

export function getContext(): Readonly<AppContext> {
  if (contextInstance == null) {
    throw new Error("App context not initialized. You should call initializeContext() first.");
  }

  return contextInstance;
}
