import { PrismaClient } from "@src/builder/migrator/prismaClient";

export type ApplySchemaProps = {
  schema: string;
};

export async function applyDbChanges(props: ApplySchemaProps) {
  return PrismaClient.db.genClient().then(() => {
    return PrismaClient.db.push(props);
  });
}
