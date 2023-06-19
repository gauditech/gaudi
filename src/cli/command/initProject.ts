import path from "path";

import _ from "lodash";
import { ArgumentsCamelCase } from "yargs";

import {
  copyDir,
  createDir,
  pathExists,
  sanitizeProjectName,
  storeTemplateOutput,
} from "@src/cli/utils";
import { assertUnreachable, saveOutputFile } from "@src/common/utils";
import { EngineConfig } from "@src/config";

/** List of all available project init templates. */
const TEMPLATES = ["vite-react-ts", "default"] as const;
export type TemplateName = (typeof TEMPLATES)[number];

export type InitProjectOptions = {
  /** New project name  */
  name: string;
  /** Template name */
  template?: string;
};

type TemplateProjectConfig = {
  projectDir: string;
  name: string;
  templateName: TemplateName;
  templateDir: string;
};

export function initProject(args: ArgumentsCamelCase<InitProjectOptions>, config: EngineConfig) {
  const templateName = checkTemplateName(args.template);
  if (templateName == null) {
    console.error(
      `Unknown project template "${args.template}". Available templates are: ${TEMPLATES.join(
        ", "
      )}.`
    );
    return 1;
  }

  switch (templateName) {
    case "vite-react-ts":
      return initTemplateProject(args, config);
    case "default":
      return initDefaultProject(args, config);
    default:
      assertUnreachable(templateName);
  }
}

export function availableInitTemplates(): TemplateName[] {
  return [...TEMPLATES];
}

// ---------- template project builder

function initTemplateProject(args: ArgumentsCamelCase<InitProjectOptions>, _config: EngineConfig) {
  const name = sanitizeProjectName(args.name);
  const projectDir = path.resolve(name);

  const templateName = checkTemplateName(args.template);
  if (templateName == null) throw `Unknown template name ${args.template}`;
  // locate template in current project
  const templateDir = path.resolve(
    __dirname,
    "../../template-create-gaudi",
    `template-${templateName}`
  );
  if (!pathExists(templateDir)) throw `Template dir not found: "${templateDir}"`;

  const config: TemplateProjectConfig = {
    projectDir,
    name,
    templateName: templateName,
    templateDir,
  };

  console.log(`Initializing "${config.templateName}" Gaudi project "${config.name}" ...`);

  return (
    Promise.resolve()
      // create project
      .then(() => console.log(`  creating project folder "${config.projectDir}"`))
      .then(() => createTemplateProject(config))
      .catch((err) => {
        console.error("Error creating project folder", err);
        throw "Error initializing project";
      })

      // copy template file
      .then(() => console.log(`  copying template files`))
      .then(() => copyTemplatefiles(config))
      .catch((err) => {
        console.error("Error copying template filea", err);
        throw "Error initializing project";
      })

      // success
      .then(() => console.log(``))
      .then(() => console.log(`Project initialized succesfully`))
      .then(() => printTemplateInstructionsMessage(name))
      .catch((err) => {
        console.log(err);
      })
  );
}

function checkTemplateName(name: string | undefined): TemplateName | undefined {
  if (name == null) return "default";

  // check if "name" exists in the list of templates, if not, "find" returns undefined
  return TEMPLATES.find((v) => v === name);
}

function createTemplateProject(config: TemplateProjectConfig) {
  createDir(config.projectDir);
}

async function copyTemplatefiles(config: TemplateProjectConfig) {
  // check root exists
  if (!pathExists(config.projectDir)) {
    throw `Template folder does not exists "${config.projectDir}"`;
  }

  // copy files recursively
  copyDir(config.templateDir, config.projectDir);
}

function printTemplateInstructionsMessage(projectName: string) {
  console.log();
  console.log("Now run");
  console.log(`  cd ${projectName}`);
  console.log("  npm install");
  console.log("  npm run dev");
  console.log("");
}

// ---------- default project builder

type DefaultProjectConfig = {
  projectName: string;
  rootDir: string;
  // these dirs should be relative to root dir
  hooksDir: string;
  gaudiDir: string;
  sourceDir: string;
  distDir: string;
};

function initDefaultProject(args: ArgumentsCamelCase<InitProjectOptions>, _config: EngineConfig) {
  const projectName = sanitizeProjectName(args.name);
  const rootDir = resolveRootDirPath(projectName);

  console.log(`Initializing Gaudi project "${projectName}" ...`);

  const projectConfig: DefaultProjectConfig = {
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
      .then(() => printDefaultInstructionsMessage(projectName))
      .catch((err) => {
        console.log(err);
      })
  );
}

function resolveRootDirPath(name: string) {
  return path.resolve(name);
}

// ----- Project dir

async function createProject(projectConfig: DefaultProjectConfig) {
  createDir(projectConfig.rootDir);

  createGitignore(projectConfig);
  createEslintrc(projectConfig);
}

async function createGitignore(projectConfig: DefaultProjectConfig) {
  const gitignorePath = path.join(projectConfig.rootDir, ".gitignore");

  storeTemplateOutput(
    gitignorePath,
    `
node_modules
${projectConfig.distDir}
`
  );
}

async function createEslintrc(projectConfig: DefaultProjectConfig) {
  const eslintrcPath = path.join(projectConfig.rootDir, ".eslintrc.js");

  storeTemplateOutput(
    eslintrcPath,
    `
module.exports = ${JSON.stringify(
      {
        root: true,
        parser: "@typescript-eslint/parser",
        plugins: ["@typescript-eslint", "import"],
        extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
        ignorePatterns: ["dist"],
        env: {
          es6: true,
          node: true,
        },
        parserOptions: {
          ecmaVersion: 2020,
        },
      },
      undefined,
      2
    )}
`
  );
}

// ----- NPM project

async function createNpmProject(projectConfig: DefaultProjectConfig) {
  const rootDir = projectConfig.rootDir;

  const packageJsonPath = path.join(rootDir, "package.json");

  storeTemplateOutput(packageJsonPath, renderPackageJsonTemplate(projectConfig));
}

function renderPackageJsonTemplate(projectConfig: DefaultProjectConfig): string {
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
        dev: 'concurrently --names hooks,gaudi --prefix-colors magenta,blue "npm run dev:hooks" "npx gaudi-cli dev --gaudi-dev"',
        "dev:hooks": "npm run build:hooks -- --watch --incremental",
        "// --- start": "",
        start: "npx gaudi-cli start",
        "// --- other": "",
        clean: `rimraf ${projectConfig.distDir}`,
      },
      devDependencies: {
        "@typescript-eslint/eslint-plugin": "^5.57.0",
        "@typescript-eslint/parser": "^5.57.0",
        concurrently: "^7.6.0",
        rimraf: "^3.0.2",
        typescript: "^5.0.3",
        eslint: "^8.37.0",
        "eslint-plugin-import": "^2.27.5",
      },
    },
    undefined,
    2
  );
}

// ----- Env config

async function createEnvConfig(projectConfig: DefaultProjectConfig) {
  const outputDir = projectConfig.rootDir;

  const envConfigPath = path.join(outputDir, ".env");

  storeTemplateOutput(envConfigPath, renderEnvConfigTemplate(projectConfig));
}

function renderEnvConfigTemplate(projectConfig: DefaultProjectConfig): string {
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

async function createReadme(projectConfig: DefaultProjectConfig) {
  const outputDir = projectConfig.rootDir;

  const envConfigPath = path.join(outputDir, "README.md");

  storeTemplateOutput(envConfigPath, renderReadmeTemplate(projectConfig));
}

function renderReadmeTemplate(projectConfig: DefaultProjectConfig): string {
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

async function createHooksEnvironment(projectConfig: DefaultProjectConfig) {
  createHooksDir(projectConfig);

  createTypescriptConfig(projectConfig);
}

function createHooksDir(projectConfig: DefaultProjectConfig) {
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

function createTypescriptConfig(projectConfig: DefaultProjectConfig) {
  const typescriptConfigPath = path.join(projectConfig.rootDir, "tsconfig.json");

  saveOutputFile(typescriptConfigPath, renderTsconfigJsonTemplate(projectConfig));
}

function renderTsconfigJsonTemplate(projectConfig: DefaultProjectConfig) {
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

async function createGaudiFiles(projectConfig: DefaultProjectConfig) {
  createGaudiBlueprint(projectConfig);

  createGaudiDir(projectConfig);
}

function createGaudiBlueprint(projectConfig: DefaultProjectConfig) {
  const projectName = projectConfig.projectName;

  const gaudiSourceDir = path.join(projectConfig.rootDir, projectConfig.sourceDir);

  createDir(gaudiSourceDir);

  const gaudiBlueprintPath = path.join(gaudiSourceDir, `${projectName}.gaudi`);

  saveOutputFile(gaudiBlueprintPath, renderGaudiBlueprintTemplate(projectConfig));
}

function renderGaudiBlueprintTemplate(projectConfig: DefaultProjectConfig) {
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

function createGaudiDir(projectConfig: DefaultProjectConfig) {
  const gaudiDir = path.join(projectConfig.rootDir, projectConfig.gaudiDir);

  createDir(gaudiDir);
}

function printDefaultInstructionsMessage(projectName: string) {
  console.log();
  console.log("Now run");
  console.log(`  cd ${projectName}`);
  console.log("  npm install");
  console.log("  npm run dev");
  console.log("");
}
