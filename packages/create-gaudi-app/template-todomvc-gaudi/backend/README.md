# Welcome to **gaudi-demo** project

This is a Gaudi demo project.

## Initializing project

In your shell run NPM initializer

```
npm create gaudi-app
```

Select "Gaudi backend project" in template selector.

## Building project

Gaudi CLI is used to build Gaudi source code but since this project also contains typescript which are built independently from Gaudi source code, both are conveniently wrapped in NPM scripts:

##### **Build**

Builds typescript sources and run Gaudi build

```
$ npm run build
```

##### **Dev**

Starts project dev mode which will build typescript and Gaudi sources but will also start watching resources and rebuild when needed.

```
$ npm run dev
```

##### **Start**

Start successfully built app. See [Runtime configuration](#runtime-configuration) for app defaults.

```
$ npm start
```

## Configure project

Project can be configured through `.env` file. Available configuration options:

### Gaudi compiler

Gaudi compiler is configured via `gaudiconfig.json`

- `rootDir` [_"src/gaudi"_] - path to directory containing Gaudi files
- `outDir` [_"dist"_] - path to directory where Gaudi engine will output it's files

##### **Server configuration**

- `GAUDI_RUNTIME_SERVER_HOST` [_"localhost"_] - Gaudi runtime app host name
- `GAUDI_RUNTIME_SERVER_PORT` [_3001_] - Gaudi runtime app port
- `GAUDI_CORS_ORIGIN` [_undefined_] - configure CORS origin ([see MDN for details](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin))

##### **Runtime configuration**

- `GAUDI_RUNTIME_DEFINITION_PATH` [_"dist/definition.json"_] - path to Gaudi definition file
- `GAUDI_RUNTIME_OUTPUT_PATH` [_"dist"_] - path to directory where Gaudi runtime will output it's files

##### **Database**

- `GAUDI_DATABASE_URL` [_"postgresql://gaudi:gaudip@localhost:5432/gaudi-demo"_] - DB connection string. Make sure you use change this to match your database settings. Building Gaudi app automatically pushes changes to configured database so make sure you use your development database settings.

## Gaudi source code

Gaudi source code files are located in `<root>/src/gaudi/demo.gaudi` file. It is compiled by Gaudi compiler and output to `dist` directory.

Gaudi compiler also produces DB schema and migration files. Since those files need to be source controlled they are output to `<root>/gaudi` directory and then copied to output directory so they are available to app.

## Hooks

Hooks allow extending Gaudi with custom JS code. This project is prepared with Typescript hooks which are compiled to JS. Typescript is completely configured through `<root>/tsconfig.json` file.

## Server

Server is a small TS script in `src/server.ts` which starts `express` server instance and configures Gaudi using Gaudi middleware. You can add other middleware and/or request handlers as required by your application.

## API

Gaudi compiler produces following API resources:

- API - http://localhost:3001/api
- API docs - http://localhost:3001/api-docs
