import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
const directory = new URL("../packages/web-component/", import.meta.url);
await mkdir(directory, { recursive: true });
const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
await copyFile(
  new URL("../src/web-component.mjs", import.meta.url),
  new URL("index.mjs", directory),
);
await copyFile(
  new URL("../docs/web-component.md", import.meta.url),
  new URL("README.md", directory),
);
await copyFile(
  new URL("../docs/temporal-stack.md", import.meta.url),
  new URL("temporal-stack.md", directory),
);
await copyFile(
  new URL("../docs/developer-topology.md", import.meta.url),
  new URL("developer-topology.md", directory),
);
await writeFile(
  new URL("package.json", directory),
  JSON.stringify(
    {
      name: "@constellation/web-component",
      version,
      type: "module",
      exports: "./index.mjs",
      files: [
        "index.mjs",
        "README.md",
        "temporal-stack.md",
        "developer-topology.md",
      ],
      dependencies: { "@constellation/core": version },
      license: "UNLICENSED",
    },
    null,
    2,
  ) + "\n",
);
