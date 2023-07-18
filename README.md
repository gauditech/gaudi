# Gaudi

_<p style="text-align: center">Build better apps in a fraction of time</p>_

<p style="text-align: center">
<a href="https://gitlab.com/gaudiorg/gaudi/-/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202-blue" /></a>
</p>

---

## About

Gaudi is a declarative programming language and a backend framework that makes it easier to build and maintain web application APIs. Describe your models and APIs in a declarative way and instantly get your app with batteries included.

With Gaudi out of the box you get expressive data modeling, customizable APIs, automatic database migration and population, powerful declarative database query engine, full stack type-safety, client library generators and much more.

## Project

### Folders layout

Project is layout as a monorepo, meaning that root folder contains some common configurations and source code and package specific configuration is located in `packages` folder and subfolders. Root folder contains some common configs and descriptions and all sources are located in `packages/<name>` folders.

Gaudi project consists of 4 packages: `compiler`, `runtime`, `cli` and `create-gaudi-app`. `compiler`, `runtime` and `cli` are interdependent and `create-audi-app` is a standalone package.

```
package.json
tsconfig.json
tsconfig.base.json
.eslintrc.js

packages
    cli
        package.json
        tsconfig.json
        src
            // source code ...
    compiler
        package.json
        tsconfig.json
        jest.config.js
        src
            // source code ...
    create-gaudi-app
        package.json
        tsconfig.json
        src
            // source code ...
    runtime
        package.json
        tsconfig.json
        jest.config.js
        src
            // source code ...
```

### NPM workspaces

Since this is a monorepo with several distinct packages we utilize [NPM workspaces](https://docs.npmjs.com/cli/v9/using-npm/workspaces) for managing NPM dependecies.
Workspace items are listed in `<root>/package.json`

```json
{
  // ...
  "workspaces": ["packages/compiler", "packages/runtime", "packages/cli"]
  // ...
}
```

NPM installed should be done in root folder. On install, NPM will traverse all packages, install their dependencies and symlink local packages. NPM will create a unified `node_modules` for all packages in root folder.
Some common build dependencies can be added to root `package.json` but all other should be adde to respective packages. This will allow easier deps maintenance.

NPM looks inside projects' `dependecies` or `devDependencies` in order to symlink local packages in favour of installing a published package from NPM.

Root `package.json` contains main NPM scripts that are mostly just proxy for package local scripts. There are two main root script versions:

- `<name>:all` - execute on entire workspace and all packages must contain that script. Eg. `npm run build:all`, `npm run clean:all`.
- `<name> <package name>` - a proxy for package specific script which requires a package name. It can be used when running a script on only one package is more appropriate. Eg. `npm run build @gaudi/compiler`, `npm run dev @gaudi/runtime`. Ofc. if a script exists only on one specific package, a standard NPM syntax can be used `npm run --workspace <package name>`. For `<package name>` either a package name (eg. `@gaudi/compiler`) or a folder (eg. `packages/compiler`) name can be used.

### **Typescript**

Each package has it's own `tsconfig`. They all extend `<root>/tsconfig.base.json` in which most compiler options are defined but they still need to define local paths and references.

Project compile time dependencies are defined using typescript [project references](https://www.typescriptlang.org/docs/handbook/project-references.html) and `tsc` is run in [build mode](https://www.typescriptlang.org/docs/handbook/project-references.html#build-mode-for-typescript). This allows `tsc` to track and recompile referenced packages.

Root package contains `tsconfig.json` which only references package configs and includes no files on itself. It could be used to call `tsc` in root folder and rebuild all packages but is mainly used by `eslint` to read source files, paths and config. Prefered way of building packages is by calling `build` NPM scripts.

For easier TS relative imports we use TS [path mapping](https://www.typescriptlang.org/docs/handbook/module-resolution.html#path-mapping). One for each package (`compiler`, `runtime`, `cli`). They could all be named eg. `src` but that we make it harder to debug when some path resolution fails. TS compiler will **not** replace these path aliases since that is a [job of bundlers](https://github.com/microsoft/TypeScript/issues/5039#issuecomment-232470330). This creates problems for outher tools which are not aware of these aliases. This is where [`typescript-transform-paths`](https://github.com/LeDDGroup/typescript-transform-paths) `tsc` transformer plugins comes in. It is used to remap these aliases back to relative paths.

### Eslint

Linter needs to be aware of TS config in order to provide it's analysis so we use `<root>/tsconfig.json` for that.

### Jest

In order to write tests in TS we use `ts-jest` which also needs to be aware of TS config. Since tests are not global but specific to each package (not all of them have the same types of test) we use `packages/<name>/tsconfig.test.json` to provide that information.

### Development

Since monorepos are not exactly straith-forward here are some typical development scenarios:

#### Building

Building entire workspace

```sh
$ npm run build:all
```

Building a single package

```sh
$ npm run build <package name>
```

Clean an rebuild entire workspace

```sh
$ npm run clean:all && npm run build:all
```

#### Development

Running development mode blocks entire console hence it cannot be run on multiple packages at once. But since TS will recompile referenced projects if they are changed, running dev mode for multiple packages probably isn't even needed.

```sh
$ npm run dev @gaudi/runtime
```
