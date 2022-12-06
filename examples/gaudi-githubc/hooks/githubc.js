export function noUnicode({ name }) {
  for (var i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 127) return false;
  }
  return true;
}
