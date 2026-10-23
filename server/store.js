import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const databasePath = resolve(here, "data/db.json");

// Deliberately load from disk for each operation so edits are visible immediately.
export async function readStore() {
  return JSON.parse(await readFile(databasePath, "utf8"));
}

export async function writeStore(data) {
  await writeFile(databasePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
