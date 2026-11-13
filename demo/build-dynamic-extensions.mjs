import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { transformWithEsbuild } from "vite";

const names = ["accordion", "counter", "element", "note", "status"];
// An optional directory allows rebuilding extension files into an already built demo.
const output = process.argv[2]
  ? pathToFileURL(`${resolve(process.argv[2])}/`)
  : new URL("./public/dynamic-extensions/", import.meta.url);
await mkdir(output, { recursive: true });
await Promise.all(
  names.map(async (name) => {
    const source = new URL(`./src/dynamic-extensions/${name}.js`, import.meta.url);
    const code = await readFile(source, "utf8");
    const built = await transformWithEsbuild(code, fileURLToPath(source), {
      loader: "js",
      minify: true,
      target: "es2022",
    });
    await writeFile(new URL(`${name}.js`, output), built.code);
  }),
);

await copyFile(
  new URL("./src/dynamic-extensions/styles.css", import.meta.url),
  new URL("styles.css", output),
);
