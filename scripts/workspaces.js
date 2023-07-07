const workspaces = process.argv.slice(2);

const spec = `[ ${workspaces.map((w) => `"npm run -w ${w}"`).join(" .. ")} ]`;

process.stdout.write(spec);
