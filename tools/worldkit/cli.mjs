#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { importOpenWorld, stableJSON } from "./adapter.mjs";

export async function main(args) {
  if (
    args[0] !== "import" ||
    !args[1] ||
    !args.includes("--config") ||
    !args.includes("--out")
  )
    throw new Error(
      "Usage: node tools/worldkit/cli.mjs import INPUT.json --config MAPPING.json --out DRAFT.json",
    );
  const option = (name) => args[args.indexOf(name) + 1];
  const inputPath = args[1],
    configPath = option("--config"),
    outputPath = option("--out");
  if (
    !configPath ||
    !outputPath ||
    [inputPath, configPath].includes(outputPath)
  )
    throw new Error(
      "Output must be a separate draft file; input/config are never overwritten.",
    );
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const draft = importOpenWorld(input, config);
  await writeFile(outputPath, stableJSON(draft), { flag: "wx" });
  const errors = draft.diagnostics.filter((d) => d.severity === "error").length;
  console.log(
    `WorldKit draft: ${Object.keys(draft.landMaps).length} maps, ${draft.portals.length} portals, ${errors} errors, ${draft.diagnostics.length - errors} warnings. ${outputPath}`,
  );
  console.log(
    "Draft only; no game, database, account, asset or production manifest was modified.",
  );
  return draft.valid ? 0 : 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2))
    .then((code) => (process.exitCode = code))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
