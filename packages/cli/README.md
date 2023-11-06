# Gaudi

<p style="text-align: center">
<a href="https://github.com/gauditech/gaudi/-/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202-blue" /></a>
</p>

---

# CLI

Gaudi CLI is a command line tool that helps you utilize Gaudi toolkit.

## Building project

### build

Build entire project. Compiles Gaudi code and copies files to output folder

```sh
gaudi build [root]
```

##### root

Set working directory

### dev

Start project dev builder which rebuilds project on detected code changes.

```sh
gaudi dev [root]
```

##### root

Set working directory

#### Options

##### --runtimePath, -r

Path to custom server runtime script. See [embedded Gaudi](../core-concepts/application.md#embedded-gaudi).

##### --watch, -w

Path to custom resources dev mode should include in watched resources list. Supports glob patterns. Use multiple parameters to set multiple paths.

## Starting application

### start

Start application server

```sh
gaudi start [root]
```

#### Options

##### root

Set working directory

##### --runtimePath, -r

Path to custom server runtime script. See [embedded Gaudi](../core-concepts/application.md#embedded-gaudi).

## Database management

### db push

Push model changes to development database

```sh
gaudi db push [root]
```

##### root

Set working directory

### db reset

Reset database

```sh
gaudi db reset [root]
```

##### root

Set working directory

### db populate

Reset DB and populate it using given populator

```sh
gaudi db populate [root] [options]
```

##### root

Set working directory

#### Options

##### --populator, -p

Set working directory **[required]**

### db migrate

Create DB migration file

```sh
gaudi db migrate [root] [options]
```

##### root

Set working directory

#### Options

##### --name, -n

Name of a migration to be created **[required]**

### db deploy

Deploy new migrations to target database

```sh
gaudi db deploy [root]
```

##### root

Set working directory
