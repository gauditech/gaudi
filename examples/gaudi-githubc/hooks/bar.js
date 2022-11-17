export function foo({ name }) {
  console.log("External Hook!!", name);
  return name !== "bad";
}
