# TODO MVC with Gaudi backend

Implementation of TODO MVC frontend in React and Typescript with Gaudi REST API for persistence

### Project structure

Project consists of two independent parts: frontend and backend, each in it's own directory. This is intended to mimic a real world project consisting of separate frontend and backend projects.

Each part can be built and started separately using NPM scripts in their repositories. For convenience, the root project contains `npm install` and `npm start` scripts that install both projects and start them, respectively. This should be enough to start and see what's going on but later feel free to dive into each of the projects edit them, and start them separately.

#### Installation

To install this project run following script

```sh
npx create-gaudi-app todomvc
```

In wizard select template `Todo MVC with Gaudi backend` and follow further instructions.

### Frontend

Frontend is a custom implementation of [Todo MVC](https://todomvc.com/) application in [React](https://react.dev) and [Typescript](https://www.typescriptlang.org/). Unlike other Todo MVC implementations, this one does not use browser's `localStorage` for data persistance but instead uses [backend REST API](#backend). The project was initialized using (`create-react-app`)[https://www.npmjs.com/package/create-react-app] and simplified for the purpose of this project.

For more details about this project, please refer to [README](./frontend/README.md) located in `frontend` directory.

### Backend

Backend is a REST API server implemented in [Gaudi](https://gaudi.tech). The project was initialized using (`create-gaudi-app`)[https://www.npmjs.com/package/create-gaudi-app]. It is completely separate from FE except the fact that it builds an API Typescript client library directly into the frontend project (`frontend/src/api-client.ts`) for easier integration. See `/backend/src/gaudi/demo.gaudi` for more details.

For more details about this project, please refer to [README](./backend/README.md) located in `backend` directory.
