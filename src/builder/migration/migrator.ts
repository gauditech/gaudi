import { PrismaClient } from "@src/builder/migration/prismaClient";

export type ApplySchemaProps = {
  schema: string;
};

export function applyDbChanges(props: ApplySchemaProps) {
  return PrismaClient.db.push(props);
}
