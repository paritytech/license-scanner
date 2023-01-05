import { dirname, join as joinPath } from "path";
import { fileURLToPath } from "url";

export const projectRoot = dirname(fileURLToPath(import.meta.url));

export const dataDir = joinPath(projectRoot, "..", "data");

export const databasePath = joinPath(projectRoot, "..", "db.json");

export const cratesDir = joinPath(dataDir, "crates");

export const repositoriesDir = joinPath(dataDir, "repositories");

export const rustCrateScannerRoot = joinPath(projectRoot, "..", "rust-crate-scanner");
