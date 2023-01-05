import { Mutex } from "async-mutex";
import fs from "fs";
import { promisify } from "util";

import { DatabaseSaveError, DB, ScanResultItem } from "./types";

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const existsAsync = promisify(fs.exists);

const dbMutex = new Mutex();

export const ensureDatabase = async function (location: string) {
  if (!(await existsAsync(location))) {
    await writeFileAsync(location, JSON.stringify({}));
  }
  return new DB(location);
};

const generationKey = "__generation__";
const saveToDatabase = async function (
  db: DB,
  rootCollection: string,
  collectionKey: string,
  itemKey: string,
  value: Record<string, unknown>,
) {
  let error: unknown = undefined;

  try {
    await dbMutex.runExclusive(async () => {
      try {
        if (generationKey in value) {
          throw new Error(`Value is not allowed to have the key ${generationKey}`);
        }

        const data = JSON.parse((await readFileAsync(db.path)).toString());
        const root = (data[rootCollection] = data[rootCollection] ?? {});
        const collection = (root[collectionKey] = root[collectionKey] ?? {});
        const prevItem = collection[itemKey];
        collection[itemKey] = {
          ...value,
          /* This might be useful in case the program crashes for whatever
             reason and then one wants to pick up from where it left off (i.e.
             where __generation__ was not updated); this functionality is not
             implemented at the moment. */
          [generationKey]: ((prevItem?.[generationKey] as number | undefined) ?? 0) + 1,
        };

        await writeFileAsync(db.path, JSON.stringify(data));
      } catch (err) {
        error = err;
      }
    });
  } catch (err) {
    error = err;
  }

  if (error !== undefined) {
    if (error instanceof Error) {
      throw error;
    } else {
      throw new DatabaseSaveError(value);
    }
  }
};

export const getSaveScanResultItem = function (db: DB) {
  return function (projectId: string, key: string, value: ScanResultItem) {
    return saveToDatabase(db, "scanResult", projectId, key, value);
  };
};
