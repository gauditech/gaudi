import * as Parsed from "../../src/types/parsed";

const models: Parsed.ModelDef[] = [
  {
    name: "Player",
    fields: [
      { name: "name", type: "string" },
      { name: "created_at", type: "datetime" },
    ],
    relations: [{ name: "games", model: "Game" }],
  },
  {
    name: "Game",
    fields: [{ name: "created_at", type: "datetime" }],
    references: [{ name: "player", model: "Player" }],
  },
  {
    name: "GameAward",
    fields: [{ name: "created_at", type: "datetime" }],
    references: [
      { name: "game", model: "Game" },
      { name: "award", model: "Award" },
    ],
  },
  {
    name: "Award",
    fields: [{ name: "name", type: "string" }],
  },
];

export default { models };
