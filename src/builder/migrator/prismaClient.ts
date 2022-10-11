import { execWithPromise } from "./utils";

import { concatKeys } from "@src/common/utils";

// ----- dev

export type DbPushProps = {
  schema?: string;
};

function dbPush(args?: DbPushProps) {
  const argsStr = concatKeys({
    [`--schema=${args?.schema}`]: args?.schema != null,
    // TODO: make data loss optional (read stdout)
    ["--accept-data-loss"]: true, // this skips all warnings
  });

  return execWithPromise(`npx prisma db push ${argsStr}`);
  // TODO: read process output and detect errors
}

function genClient() {
  return execWithPromise(`npx prisma generate`);
}

const db = { genClient, push: dbPush };

// -----

export const PrismaClient = { db };
