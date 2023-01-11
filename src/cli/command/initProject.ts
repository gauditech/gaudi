import path from "path";

import { ArgumentsCamelCase } from "yargs";

import { createCommandRunner } from "@src/cli/runner";
import { createDir, sanitizeProjectName, storeTemplateOutput } from "@src/cli/utils";
import { saveOutputFile } from "@src/common/utils";
import { EngineConfig } from "@src/config";

// --- init project

export type InitProjectOptions = {
  name: string;
};
export function initProject(args: ArgumentsCamelCase<InitProjectOptions>, config: EngineConfig) {
  console.log("Initializing new Gaudi project project ...");

  const projectName = sanitizeProjectName(args.name);
  const outputDir = resolveOutputDirPath(projectName);

  return (
    Promise.resolve()
      // create project
      .then(() => console.log(`  create folder "${projectName}"`))
      .then(() => createProjectDir(outputDir))
      .catch((err) => {
        console.error("Error creating project folder", err);
        throw "Error initializing project";
      })
      // create package.json
      .then(() => console.log(`  init NPM package`))
      .then(() => createNpmProject(outputDir, projectName))
      .catch((err) => {
        console.error("Error initializing NPM package", err);
        throw "Error initializing project";
      })
      // create .env config
      .then(() => console.log(`  create .env config`))
      .then(() => createEnvConfig(outputDir, projectName))
      .catch((err) => {
        console.error("Error creating .env config", err);
        throw "Error initializing project";
      })
      // create README.md
      .then(() => console.log(`  create README file`))
      .then(() => createReadme(outputDir, projectName))
      .catch((err) => {
        console.error("Error creating README", err);
        throw "Error initializing project";
      })
      // create hooks environment
      .then(() => console.log(`  create hooks environment`))
      .then(() => createHooksEnvironment(outputDir, projectName))
      .catch((err) => {
        console.error("Error creating hooks environemnt", err);
        throw "Error initializing project";
      })
      // gaudi files
      .then(() => console.log(`  create Gaudi files`))
      .then(() => createGaudiFiles(outputDir, projectName))
      .catch((err) => {
        console.error("Error creating Gaudi files", err);
        throw "Error initializing project";
      })
      // TODO: docker (postgres, adminer, ...)
      .then(() => console.log(``))
      .then(() => console.log(`Project initialized succesfully`))
      .catch((err) => {
        console.log(err);
      })
  );
}

function resolveOutputDirPath(name: string) {
  return path.resolve(name);
}

async function createProjectDir(dirPath: string) {
  createDir(dirPath);
}

// ----- NPM project

async function createNpmProject(outputDir: string, projectName: string) {
  const packageJsonPath = path.join(outputDir, "package.json");

  storeTemplateOutput(packageJsonPath, renderPackageJsonTemplate(projectName));

  // link local gaudi package
  // TODO: remove this once gaudi gets published on NPM
  await createCommandRunner("npm", ["link", "@gaudi/engine", "--silent"], {
    cwd: outputDir,
  }).start();
}

function renderPackageJsonTemplate(projectName: string): string {
  return JSON.stringify(
    {
      name: projectName,
      version: "1.0.0",
      description: "",
      scripts: {
        "// --- build": "",
        build: "npm run build:hooks && npx gaudi-cli build",
        "build:hooks": "tsc --preserveWatchOutput",
        "// --- dev": "",
        dev: 'concurrently --names hooks,gaudi "npm run dev:hooks" "npx gaudi-cli dev --gaudi-dev"',
        "dev:hooks": 'chokidar ./hooks  --debounce --initial --command "npm run build:hooks"',
        "// --- other": "",
        clean: "rimraf ./dist",
      },
      devDependencies: {
        "chokidar-cli": "^3.0.0",
        concurrently: "^7.6.0",
        rimraf: "^3.0.2",
        typescript: "^4.8.3",
      },
    },
    undefined,
    2
  );
}

// ----- Env config

async function createEnvConfig(outputDir: string, projectName: string) {
  const envConfigPath = path.join(outputDir, ".env");

  storeTemplateOutput(envConfigPath, renderEnvConfigTemplate(projectName));
}

function renderEnvConfigTemplate(projectName: string): string {
  return `
GAUDI_DATABASE_URL=postgresql://gaudi:gaudip@localhost:5432/${projectName}

GAUDI_ENGINE_INPUT_PATH=./src/${projectName}.gaudi
GAUDI_ENGINE_OUTPUT_PATH=./dist

GAUDI_RUNTIME_DEFINITION_PATH=./dist/definition.json
GAUDI_RUNTIME_OUTPUT_PATH=./dist
GAUDI_RUNTIME_HOOK_PATH=./dist/hooks
GAUDI_RUNTIME_SERVER_HOST=localhost
GAUDI_RUNTIME_SERVER_PORT=3001
`;
}

// ----- README

async function createReadme(outputDir: string, projectName: string) {
  const envConfigPath = path.join(outputDir, "README.md");

  storeTemplateOutput(envConfigPath, renderReadmeTemplate(projectName));
}

function renderReadmeTemplate(projectName: string): string {
  return `
# Docs for __${projectName}__ project

TODO: show the relevant links, eg. localhost:3001/api, /api-docs, /api-admin, /api-admin-docs
`;
}

// ----- Hooks

async function createHooksEnvironment(outputDir: string, projectName: string) {
  const hooksDir = createHooksDir(outputDir, projectName);

  createHooksFile(hooksDir);

  createTypescriptConfig(outputDir, hooksDir);
}

function createHooksDir(outputDir: string, _projectName: string) {
  const hooksDir = path.join(outputDir, "hooks");

  createDir(hooksDir);

  return hooksDir;
}

function createHooksFile(hooksDir: string) {
  const hooksFilePath = path.join(hooksDir, "hooks.ts");

  saveOutputFile(hooksFilePath, renderHooksFileTemplate());
}

function renderHooksFileTemplate() {
  return `
  //
  // Place your hooks code here ...
  //
  `;
}

function createTypescriptConfig(outputDir: string, hooksDir: string) {
  const typescriptConfigPath = path.join(outputDir, "tsconfig.json");

  // use relative path for more flexibility
  const hooksRelativeDir = path.relative(outputDir, hooksDir);

  saveOutputFile(typescriptConfigPath, renderTsconfigJsonTemplate(hooksRelativeDir));
}

function renderTsconfigJsonTemplate(hooksDir: string) {
  return JSON.stringify(
    {
      compilerOptions: {
        module: "commonjs",
        esModuleInterop: true,
        resolveJsonModule: true,
        allowJs: true,
        target: "es6",
        noImplicitAny: true,
        moduleResolution: "node",
        sourceMap: true,
        outDir: "dist",
        rootDir: ".",
        baseUrl: ".",
        strict: true,
        paths: {
          "*": ["node_modules/*"],
        },
        lib: ["es2020"],
      },
      include: [hooksDir],
    },
    undefined,
    2
  );
}

// ------ Gaudi files

async function createGaudiFiles(outputDir: string, projectName: string) {
  createGaudiBlueprint(outputDir, projectName);

  createGaudiDir(outputDir);
}

function createGaudiBlueprint(outputDir: string, projectName: string) {
  const gaudiSourceDir = path.join(outputDir, "src");

  createDir(gaudiSourceDir);

  const gaudiBlueprintPath = path.join(gaudiSourceDir, `${projectName}.gaudi`);

  saveOutputFile(gaudiBlueprintPath, renderGaudiBlueprintTemplate());
}

function renderGaudiBlueprintTemplate() {
  return `
//
// Place your Gaudi blueprint code here ...
//
`;
}

function createGaudiDir(outputDir: string) {
  const gaudiDir = path.join(outputDir, "gaudi");

  createDir(gaudiDir);
}
