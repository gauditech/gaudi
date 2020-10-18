import { ModelDef } from "../../src/types/model";

const models: ModelDef[] = [
  {
    name: "Player",
    fields: [
      { name: "name", type: "string" },
      { name: "created_at", type: "datetime" },
    ],
  },
  {
    name: "Game",
    fields: [{ name: "created_at", type: "datetime" }],
    references: [{ name: "player", model: "Player" }],
  },
];

export default { models };
