import path from "path";

import _ from "lodash";
import { ArgumentsCamelCase } from "yargs";

import { createCommandRunner } from "@src/cli/runner";
import { createDir, sanitizeProjectName, storeTemplateOutput } from "@src/cli/utils";
import { saveOutputFile } from "@src/common/utils";
import { EngineConfig } from "@src/config";

type ProjectConfig = {
  projectName: string;
  rootDir: string;
  // these dirs should be relative to root dir
  hooksDir: string;
  gaudiDir: string;
  sourceDir: string;
  distDir: string;
};

export type InitProjectOptions = {
  /** New project name  */
  name: string;
};

export function initProject(args: ArgumentsCamelCase<InitProjectOptions>, config: EngineConfig) {
  const projectName = sanitizeProjectName(args.name);
  const rootDir = resolveRootDirPath(projectName);

  console.log(`Initializing new Gaudi project "${projectName}" ...`);

  const projectConfig: ProjectConfig = {
    projectName,
    rootDir,
    // relative to root dir
    hooksDir: "hooks",
    gaudiDir: "gaudi",
    sourceDir: "src",
    distDir: "dist",
  };

  return (
    Promise.resolve()
      // create project
      .then(() => console.log(`  creating project folder "${rootDir}"`))
      .then(() => createProject(projectConfig))
      .catch((err) => {
        console.error("Error creating project folder", err);
        throw "Error initializing project";
      })

      // create package.json
      .then(() => console.log(`  creating NPM package`))
      .then(() => createNpmProject(projectConfig))
      .catch((err) => {
        console.error("Error creating NPM package", err);
        throw "Error initializing project";
      })

      // create .env config
      .then(() => console.log(`  creating .env config`))
      .then(() => createEnvConfig(projectConfig))
      .catch((err) => {
        console.error("Error creating .env config", err);
        throw "Error initializing project";
      })

      // create README.md
      .then(() => console.log(`  creating README file`))
      .then(() => createReadme(projectConfig))
      .catch((err) => {
        console.error("Error creating README", err);
        throw "Error initializing project";
      })

      // create hooks environment
      .then(() => console.log(`  creating hooks environment in "${projectConfig.hooksDir}"`))
      .then(() => createHooksEnvironment(projectConfig))
      .catch((err) => {
        console.error("Error creating hooks environemnt", err);
        throw "Error initializing project";
      })

      // gaudi files
      .then(() => console.log(`  creating Gaudi source files in "${projectConfig.sourceDir}"`))
      .then(() => createGaudiFiles(projectConfig))
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

function resolveRootDirPath(name: string) {
  return path.resolve(name);
}

// ----- Project dir

async function createProject(projectConfig: ProjectConfig) {
  createDir(projectConfig.rootDir);

  createGitignore(projectConfig);
}

async function createGitignore(projectConfig: ProjectConfig) {
  const gitignorePath = path.join(projectConfig.rootDir, ".gitignore");

  storeTemplateOutput(
    gitignorePath,
    `
node_modules
${projectConfig.distDir}
`
  );
}

// ----- NPM project

async function createNpmProject(projectConfig: ProjectConfig) {
  const rootDir = projectConfig.rootDir;

  const packageJsonPath = path.join(rootDir, "package.json");

  storeTemplateOutput(packageJsonPath, renderPackageJsonTemplate(projectConfig));

  // link local gaudi package
  // TODO: remove this once gaudi gets published on NPM
  await createCommandRunner("npm", ["link", "@gaudi/engine", "--silent"], {
    cwd: rootDir,
  }).start();
}

function renderPackageJsonTemplate(projectConfig: ProjectConfig): string {
  return JSON.stringify(
    {
      name: projectConfig.projectName,
      version: "1.0.0",
      description: "",
      scripts: {
        "// --- build": "",
        build: "npm run build:hooks && npx gaudi-cli build",
        "build:hooks": "tsc --preserveWatchOutput",
        "// --- dev": "",
        dev: 'concurrently --names hooks,gaudi "npm run dev:hooks" "npx gaudi-cli dev --gaudi-dev"',
        "dev:hooks": `chokidar ${projectConfig.hooksDir}  --debounce --initial --command "npm run build:hooks"`,
        "// --- start": "",
        start: "npx gaudi-cli start",
        "// --- other": "",
        clean: `rimraf ${projectConfig.distDir}`,
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

async function createEnvConfig(projectConfig: ProjectConfig) {
  const outputDir = projectConfig.rootDir;

  const envConfigPath = path.join(outputDir, ".env");

  storeTemplateOutput(envConfigPath, renderEnvConfigTemplate(projectConfig));
}

function renderEnvConfigTemplate(projectConfig: ProjectConfig): string {
  return `
GAUDI_DATABASE_URL=postgresql://gaudi:gaudip@localhost:5432/${projectConfig.projectName}

GAUDI_ENGINE_INPUT_PATH=${projectConfig.sourceDir}/${projectConfig.projectName}.gaudi
GAUDI_ENGINE_OUTPUT_PATH=${projectConfig.distDir}

GAUDI_RUNTIME_DEFINITION_PATH=${projectConfig.distDir}/definition.json
GAUDI_RUNTIME_OUTPUT_PATH=${projectConfig.distDir}
GAUDI_RUNTIME_SERVER_HOST=localhost
GAUDI_RUNTIME_SERVER_PORT=3001
`;
}

// ----- README

async function createReadme(projectConfig: ProjectConfig) {
  const outputDir = projectConfig.rootDir;

  const envConfigPath = path.join(outputDir, "README.md");

  storeTemplateOutput(envConfigPath, renderReadmeTemplate(projectConfig));
}

function renderReadmeTemplate(projectConfig: ProjectConfig): string {
  return `
# Welcome to **${projectConfig.projectName}** project

This is a Gaudi starter project.

## Initializing project
To initialize a new starter project use Gaudi CLI anywhere where CLI is available.
\`\`\`
npx gaudi-cli init <project-name>
\`\`\`

Project name will be used as a name for project folder, NPM package name, Gaudi source file and DB name. As such it will be sanitized and all (regex) "non-word" characters will be replaced with "-".
Eg.
 * \`"new project 1\` -> \`"new-project-1"\`
 * \`"@myorg/acme_util"\` -> \`"myorg-acme_util"\`

## Building project
Gaudi CLI is used to build Gaudi source code but since this project also contains Typescript hooks which are built independently from Gaudi source code, both are conveniently wrapped in NPM scripts:

##### **Build**
Builds hooks sources and run Gaudi build
\`\`\`
$ npm run build
\`\`\`

##### **Dev**
Starts project dev mode which will build hooks sources and Gaudi build but will also start watching resources and rebuild when needed.
\`\`\`
$ npm run dev
\`\`\`

##### **Start**
Start successfully built app. See [Runtime configuration](#runtime-configuration) for app defaults.
\`\`\`
$ npm run start
\`\`\`

### Building Gaudi engine
If building Gaudi engine in parallel, Gaudi engine's output (\`${projectConfig.distDir}\`) needs to be connected/linked to this project's dependencies.

In Gaudi output folder run following
\`\`\`
npm install # creates node_modules folder
npm link # compensate for not being on NPM repository
\`\`\`

In this project's folder run
\`\`\`
npm link @gaudi/engine
\`\`\`
This is executed when starter project is initialized but symlink is lost after each \`npm i\` and it must be repeated.

Alternatively, you can install Gaudi engine as a local file but since this is very machine specific, it need s to be installed manually.
\`\`\`
npm i file://path/to/gaudi/dist
\`\`\`


## Configure project
Project can be configured through \`.env\` file. Available configuration options:

#### **Database**
* \`GAUDI_DATABASE_URL\` [_"postgresql://gaudi:gaudip@localhost:5432/${projectConfig.projectName}"_] - DB connection string

#### **Gaudi engine**
* \`GAUDI_ENGINE_INPUT_PATH\` [_"${projectConfig.sourceDir}/${projectConfig.projectName}.gaudi"_] - path to Gaudi source code files
* GAUDI_ENGINE_OUTPUT_PATH\` [_"${projectConfig.distDir}"_] - path to folder where Gaudi engine will output it's files

#### **Runtime configuration**
* \`GAUDI_RUNTIME_DEFINITION_PATH\` [_"${projectConfig.distDir}/definition.json"_] - path to Gaudi definition file
* \`GAUDI_RUNTIME_OUTPUT_PATH\` [_"${projectConfig.distDir}"_] - path to folder where Gaudi runtime will output it's files
* \`GAUDI_RUNTIME_SERVER_HOST\` [_"localhost"_] - Gaudi runtime app host name
* \`GAUDI_RUNTIME_SERVER_PORT\` [_3001_] - Gaudi runtime app port


## Hooks
Hooks allow extending Gaudi with custom code. Currently, Gaudi allows only JS hooks. This project is prepared with Typescript hooks which are compiled to JS. Typescript is completely configured through \`<root>/tsconfig.json\` file.

Hooks code must be located in \`<root>/${projectConfig.hooksDir}\` folder in one or multiple files and/or subfolders.

## Gaudi source code
Gaudi source code files are located in \`<root>/${projectConfig.sourceDir}/${projectConfig.projectName}.gaudi\` file. It is compiled by Gaudi engine and output to \`${projectConfig.distDir}\` folder.

Gaudi engine also produces DB schema and migration files. Since those files need to be source controlled they are output to \`<root>/${projectConfig.gaudiDir}\` folder and then copied to output folder so they are available to app.

### API
Gaudi engine produces following API resources:
* API - http://localhost:3001/api
* API docs - http://localhost:3001/api-docs
* Admin API - http://localhost:3001/api-admin
* Admin API docs - http://localhost:3001/api-admin-docs
`;
}

// ----- Hooks

async function createHooksEnvironment(projectConfig: ProjectConfig) {
  createHooksDir(projectConfig);

  createTypescriptConfig(projectConfig);
}

function createHooksDir(projectConfig: ProjectConfig) {
  const hooksDir = path.join(projectConfig.rootDir, projectConfig.hooksDir);

  createDir(hooksDir);

  createHooksFile(hooksDir);
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

function createTypescriptConfig(projectConfig: ProjectConfig) {
  const typescriptConfigPath = path.join(projectConfig.rootDir, "tsconfig.json");

  saveOutputFile(typescriptConfigPath, renderTsconfigJsonTemplate(projectConfig));
}

function renderTsconfigJsonTemplate(projectConfig: ProjectConfig) {
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
        outDir: projectConfig.distDir,
        rootDir: ".",
        baseUrl: ".",
        strict: true,
        paths: {
          "*": ["node_modules/*"],
        },
        lib: ["es2020"],
      },
      include: [projectConfig.hooksDir],
    },
    undefined,
    2
  );
}

// ------ Gaudi files

async function createGaudiFiles(projectConfig: ProjectConfig) {
  createGaudiBlueprint(projectConfig);

  createGaudiDir(projectConfig);
}

function createGaudiBlueprint(projectConfig: ProjectConfig) {
  const projectName = projectConfig.projectName;

  const gaudiSourceDir = path.join(projectConfig.rootDir, projectConfig.sourceDir);

  createDir(gaudiSourceDir);

  const gaudiBlueprintPath = path.join(gaudiSourceDir, `${projectName}.gaudi`);

  saveOutputFile(gaudiBlueprintPath, renderGaudiBlueprintTemplate(projectConfig));
}

function renderGaudiBlueprintTemplate(projectConfig: ProjectConfig) {
  const runtimeName = _.upperFirst(_.camelCase(projectConfig.projectName));

  return `
runtime ${runtimeName} {
  source path "${projectConfig.hooksDir}"
}
  

//
// Place your Gaudi source code here ...
//
`;
}

function createGaudiDir(projectConfig: ProjectConfig) {
  const gaudiDir = path.join(projectConfig.rootDir, projectConfig.gaudiDir);

  createDir(gaudiDir);
}
