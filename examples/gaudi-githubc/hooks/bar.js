export function foo(field) {
  console.log("External Hook!!", field);
  return field !== "bad";
}
