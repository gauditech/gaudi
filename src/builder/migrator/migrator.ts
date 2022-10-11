import { PrismaClient } from "@src/builder/migrator/prismaClient";

export type ApplySchemaProps = {
  schema: string;
};

export function applyDbChanges(props: ApplySchemaProps) {
  PrismaClient.db.genClient().then(() => PrismaClient.db.push(props));
}
