import { exec } from "child_process";
import { promisify } from "util";

import { concatKeys } from "@src/common/utils";

const execWithPromise = promisify(exec);

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

const db = { push: dbPush };

// -----

export const PrismaClient = { db };
