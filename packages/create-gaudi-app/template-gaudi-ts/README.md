
# Welcome to **gaudi-demo** project

This is a Gaudi starter project.

## Initializing project
To initialize a new starter project use Gaudi CLI anywhere where CLI is available.
```
npx gaudi-cli init <project-name>
```

Project name will be used as a name for project folder, NPM package name, Gaudi source file and DB name. As such it will be sanitized and all (regex) "non-word" characters will be replaced with "-".
Eg.
 * `"new project 1` -> `"new-project-1"`
 * `"@myorg/acme_util"` -> `"myorg-acme_util"`

## Building project
Gaudi CLI is used to build Gaudi source code but since this project also contains Typescript hooks which are built independently from Gaudi source code, both are conveniently wrapped in NPM scripts:

##### **Build**
Builds hooks sources and run Gaudi build
```
$ npm run build
```

##### **Dev**
Starts project dev mode which will build hooks sources and Gaudi build but will also start watching resources and rebuild when needed.
```
$ npm run dev
```

##### **Start**
Start successfully built app. See [Runtime configuration](#runtime-configuration) for app defaults.
```
$ npm run start
```

### Building Gaudi engine
If building Gaudi engine in parallel, Gaudi engine's output (`dist`) needs to be connected/linked to this project's dependencies.

In Gaudi output folder run following
```
npm install # creates node_modules folder
npm link # compensate for not being on NPM repository
```

In this project's folder run
```
npm link @gaudi/engine
```
This is executed when starter project is initialized but symlink is lost after each `npm i` and it must be repeated.

Alternatively, you can install Gaudi engine as a local file but since this is very machine specific, it need s to be installed manually.
```
npm i file://path/to/gaudi/dist
```


## Configure project
Project can be configured through `.env` file. Available configuration options:

#### **Database**
* `GAUDI_DATABASE_URL` [_"postgresql://gaudi:gaudip@localhost:5432/gaudi-demo"_] - DB connection string

#### **Gaudi engine**
* `GAUDI_ENGINE_INPUT_PATH` [_"src/gaudi-demo.gaudi"_] - path to Gaudi source code files
* GAUDI_ENGINE_OUTPUT_PATH` [_"dist"_] - path to folder where Gaudi engine will output it's files

#### **Runtime configuration**
* `GAUDI_RUNTIME_DEFINITION_PATH` [_"dist/definition.json"_] - path to Gaudi definition file
* `GAUDI_RUNTIME_OUTPUT_PATH` [_"dist"_] - path to folder where Gaudi runtime will output it's files
* `GAUDI_RUNTIME_SERVER_HOST` [_"localhost"_] - Gaudi runtime app host name
* `GAUDI_RUNTIME_SERVER_PORT` [_3001_] - Gaudi runtime app port


## Hooks
Hooks allow extending Gaudi with custom code. Currently, Gaudi allows only JS hooks. This project is prepared with Typescript hooks which are compiled to JS. Typescript is completely configured through `<root>/tsconfig.json` file.

Hooks code must be located in `<root>/hooks` folder in one or multiple files and/or subfolders.

## Gaudi source code
Gaudi source code files are located in `<root>/src/gaudi-demo.gaudi` file. It is compiled by Gaudi engine and output to `dist` folder.

Gaudi engine also produces DB schema and migration files. Since those files need to be source controlled they are output to `<root>/gaudi` folder and then copied to output folder so they are available to app.

### API
Gaudi engine produces following API resources:
* API - http://localhost:3001/api
* API docs - http://localhost:3001/api-docs
* Admin API - http://localhost:3001/api-admin
* Admin API docs - http://localhost:3001/api-admin-docs
