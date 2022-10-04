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
        "start-server": "node index.js"
      },
      "engines": {
        "node": ">=16.15.0"
      },
      "dependencies": {
        "express": "^4.18.1",
        "prisma": "^4.3.1"
      }
    }
  `
}
