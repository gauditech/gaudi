import { source } from "common-tags";

export type BuildPackageData = {
  package: {
    name: string;
    description: string;
    version: string;
  };
};

export function render(data: BuildPackageData): string {
  // prettier-ignore
  return source`
    {
      "name": "${data.package.name}",
      "description": "${data.package.description ?? ''}",
      "version": "${data.package.version}",
      "main": "index.js",
      "scripts": {
        "start-server": "node index.js",
        "postinstall": "npx prisma generate --schema=./db/db/schema.prisma"
      },
      "engines": {
        "node": ">=16.15.0"
      },
      "dependencies": {
        "express": "^4.18.2",
        "prisma": "^4.4.0",
        "yup": "^0.32.11",
        "@prisma/client": "^4.4.0"
      }
    }
  `
}
