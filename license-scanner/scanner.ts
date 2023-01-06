import assert from "assert";
import { dirname, join as joinPath, relative as relativePath } from "path";

import { getOrDownloadCrate, getVersionedCrateName } from "./crate";
import { getOrDownloadRepository } from "./repository";
import { scanQueue, scanQueueSize } from "./synchronization";
import {
  CargoMetadataOutputV1,
  CratesIoCrate,
  DetectionOverrideById,
  DetectionOverrideByStartsWith,
  RepositoryCrate,
  RustCrateScannerOutput,
  ScanOptions,
  ScanOptionsRust,
  UnexpectedCrateSourceError,
} from "./types";
import { execute, existsAsync, readFileAsync, walkFiles } from "./utils";

const scanCrates = async function (rust: ScanOptionsRust, options: Omit<ScanOptions, "rust">) {
  const {
    root,
    saveResult,
    dirs,
    transformItemKey = function (key: string) {
      return key;
    },
    initialRoot,
    logger,
  } = options;

  const project = await new Promise<RustCrateScannerOutput>((resolve, reject) => {
    execute(rust.cargoExecPath, ["run", "--release", root, String(rust.shouldCheckForCargoLock)], {
      cwd: rust.rustCrateScannerRoot,
    })
      .then((stdout) => {
        resolve(JSON.parse(stdout));
      })
      .catch(reject);
  });

  if (project.license !== null && project.license !== undefined) {
    assert(typeof project.license === "string");
    saveResult(initialRoot, transformItemKey("Cargo.toml"), { license: project.license });
  }

  for (const { source, ...subCrate } of project.crates ?? []) {
    if (source === null) {
      continue;
    }

    logger.debug(`Handling crate ${getVersionedCrateName(subCrate)}`);

    const versionedCrateName = getVersionedCrateName(subCrate);

    const cratePath = await (function () {
      switch (source.tag) {
        case "git": {
          return getOrDownloadRepository(dirs.repositories, new RepositoryCrate(subCrate, source), logger);
        }
        case "crates.io": {
          return getOrDownloadCrate(dirs.crates, new CratesIoCrate(subCrate, source), logger);
        }
        default: {
          throw new UnexpectedCrateSourceError({ ...subCrate, source });
        }
      }
    })();

    const crateScanRoot = await new Promise<string>((resolve, reject) => {
      /*
        Sometimes cargo metadata might fail if the crate is not published properly
        E.g. we saw the following:

        error: failed to load manifest for workspace member `build-helper-0.1.1/tests/pkgs/basic`

        Caused by:
          failed to read `build-helper-0.1.1/tests/pkgs/basic/Cargo.toml`

        Caused by:
          No such file or directory (os error 2)
      */
      execute(rust.cargoExecPath, ["metadata", "--format-version=1"], { cwd: cratePath })
        .then((stdout) => {
          if (stdout) {
            const cargoMeta: CargoMetadataOutputV1 = JSON.parse(stdout);
            for (const pkg of cargoMeta.packages) {
              if (pkg.version === subCrate.version && pkg.name === subCrate.name) {
                resolve(dirname(pkg.manifest_path));
                return;
              }
            }
            reject(`Path for crate ${subCrate.name} was not found in ${cratePath}`);
          } else {
            /* If cargo metadata doesn't provide meaningful output, e.g. it was
               not able to figure out the metadata because the crate was not
               published correctly, then fallback to scanning all the files */
            resolve(cratePath);
          }
        })
        .catch(reject);
    });

    await scan({
      ...options,
      root: crateScanRoot,
      transformItemKey: function (text) {
        return `${versionedCrateName} file: ${text}`;
      },
      rust: { ...rust, shouldCheckForCargoLock: false },
      meta: { crate: subCrate },
    });
  }
};

export const scan = async function (options: ScanOptions) {
  const {
    saveResult,
    root,
    rust,
    transformItemKey = function (key: string) {
      return key;
    },
    meta,
    initialRoot,
    matchLicense,
    detectionOverrides,
    tracker,
    logger,
  } = options;

  toNextFile: for await (const file of walkFiles(root)) {
    const key = transformItemKey(relativePath(root, file.path));
    tracker.setFileKey(file.path, key);

    logger.debug(`Enqueueing file ${file.path}`);

    for (const rule of detectionOverrides ?? []) {
      if (rule instanceof DetectionOverrideById) {
        if (key !== rule.value) {
          continue;
        }
        logger.info(`Found ID override "${rule.value}" for file ${file.path}`);
      } else if (rule instanceof DetectionOverrideByStartsWith) {
        if (!key.startsWith(rule.value)) {
          continue;
        }
        logger.info(`Found STARTS_WITH override "${rule.value}" for file ${file.path}`);
      }

      if (rule.result === null) {
        logger.info(`Skipping setting a result for ${file.path} because it was overridden with a null result`);
        continue toNextFile;
      }

      if (rule.contents !== null) {
        const fileContents = (await readFileAsync(file.path)).toString();
        if (rule.contents != fileContents) {
          throw new Error(`Rule ${rule.value}'s provided file contents do not matching the contents of ${file.path}'`);
        }
      }

      saveResult(initialRoot, key, { ...rule.result, meta });
      continue toNextFile;
    }

    scanQueue.add(async () => {
      const result = await matchLicense(file.path);
      if (result === undefined) {
        return;
      }
      saveResult(initialRoot, key, { ...result, meta: Object.assign({}, meta, result.meta) });
    });
    await scanQueue.onSizeLessThan(1);
  }

  if (rust !== null) {
    const rootCargoToml = joinPath(root, "Cargo.toml");
    if (await existsAsync(rootCargoToml)) {
      scanCrates(rust, options);
    }
  }
};
