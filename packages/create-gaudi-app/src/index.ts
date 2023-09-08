#!/usr/bin/env node

import path from "path";
import fs from "fs";
import prompts from "prompts";
import chalk from "chalk";
import initDebug, { Debugger } from "debug";
const logger = initLogger("gaudi:create-gaudi-app");

// --- templates
type TemplateName = "template-vite-react-ts" | "template-gaudi-ts";
type Template = {
  name: TemplateName;
  displayName: string;
};

type PromptResult = {
  rootDir: string;
  projectName: string;
  templateName: Template;
  overwriteDir: boolean;
};

const DefaultTemplateName: TemplateName = "template-gaudi-ts";
const TEMPLATES: Template[] = [
  { name: "template-gaudi-ts", displayName: "Gaudi backend project" },
  { name: "template-vite-react-ts", displayName: "Gaudi backend with React+TS+Vite frontend" },
];
// list of files that are ignored when checking empty dir
const IGNORED_PATHS = [".git"];

async function init() {
  // TODO: read initial template from args

  const rootDir = process.argv[2] ?? process.cwd();
  logger.debug(`Arguments: rootDir="${rootDir}"`);

  prompts.override({ rootDir });

  let answers: prompts.Answers<keyof PromptResult>;
  try {
    answers = await prompts(
      [
        // project name
        {
          type: "text",
          name: "projectName",
          message: "Project name:",
          format: (value) => value.trim() || DefaultTemplateName,
        },
        // root dir - injected at the begining and should not be asked
        {
          type: "text",
          name: "rootDir",
          message: "Root dir:",
          initial: rootDir,
        },
        // check if target dir already exists
        {
          type: (_, { rootDir, projectName }) => {
            const projectDir = path.join(rootDir, projectName);

            return !pathExists(projectDir) || isDirEmpty(projectDir) ? null : "confirm";
          },
          name: "overwriteDir",
          message: (_, { projectName }) => {
            const projectDir = path.join(rootDir, projectName);

            return `Target directory "${projectDir}" is not empty. Remove existing files and continue?`;
          },
        },
        // shoul we overwrite it
        {
          type: (_, { overwriteDir }) => {
            if (overwriteDir === false) {
              throw new Error(chalk.red("✖") + " Operation cancelled");
            }
            return null;
          },
          name: "overwriteDir",
        },
        // select template
        {
          type: "select",
          name: "templateName",
          message: "Select a template:",
          choices: () => TEMPLATES.map((fw) => ({ title: fw.displayName, value: fw.name })),
        },
      ],
      {
        onCancel: () => {
          throw new Error(chalk.red("✖") + " Operation cancelled");
        },
      }
    );
    logger.debug("Answers", answers);

    // define template source dir and target dir
    const projectDir = path.resolve(answers.rootDir, answers.projectName);
    logger.debug("Project dir (target)", projectDir);
    const templateDir = path.join(__dirname, "..", answers.templateName);
    logger.debug("Template dir (source)", templateDir);

    // prepare project dir
    createDir(projectDir, answers.overwriteDir);

    // sanity check
    ensurePathExists(projectDir, `Project dir does not exist: "${projectDir}"`);
    ensurePathExists(templateDir, `Template dir does not exist: "${templateDir}"`);

    // calculate relative dir for shorter messages
    const relativeDir = path.relative(process.cwd(), projectDir);

    console.log("");
    console.log(`Initializing project in "${relativeDir}" ...`);

    // copy tpl files
    copyDir(templateDir, projectDir);

    // TODO: adjust p.json (package name, project name)

    // write next steps msg
    console.log("");
    console.log("Done. Now run:");
    console.log(`  cd "${relativeDir}"`);
    console.log("  npm install");
    console.log("  npm run dev");
    console.log("");
  } catch (err: any) {
    logger.error(err.message);
    return;
  }
}

// --- let's do the init
(async () => {
  await init();
})();

// ----- utils

function sanitizeProjectName(name: string): string {
  return (
    name
      // allow only word characters, replace all others with "-"
      .replace(/\W/g, "-")
      // remove multiple consecutive "-"
      .replace(/-{2,}/g, "-")
      // remove start/end "-"
      .replace(/^-+|-+$/, "")
  );
}

export function pathExists(path: string) {
  return fs.existsSync(path);
}

function isDirEmpty(path: string) {
  const files = fs.readdirSync(path);
  return files.length === 0 || files.every(isIgnoredFile);
}

function createDir(path: string, overwrite = false) {
  if (pathExists(path)) {
    if (overwrite) {
      emptyDir(path);
    }
  } else {
    fs.mkdirSync(path, { recursive: true });
    logger.debug("Created project", path);
  }
}

function emptyDir(dir: string) {
  if (!pathExists(dir)) {
    return;
  }

  for (const file of fs.readdirSync(dir)) {
    if (isIgnoredFile(file)) {
      continue;
    }
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true });
  }
}

function isIgnoredFile(name: string) {
  return IGNORED_PATHS.includes(name);
}

function copy(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const src = path.resolve(srcDir, file);
    const dest = path.resolve(destDir, file);

    copy(src, dest);
  }
}

function ensurePathExists(path: string, message: string) {
  if (!pathExists(path)) {
    throw new Error(message);
  }
}

function initLogger(namespace: string): Record<"debug" | "error", Debugger> {
  return {
    debug: initDebug(namespace),
    error: initDebug([namespace, "error"].join(":")),
  };
}
