import { PrismaClient } from "@src/builder/migrator/prismaClient";

export type ApplySchemaProps = {
  schema: string;
};

export function applyDbChanges(props: ApplySchemaProps) {
  return PrismaClient.db.push(props);
}
