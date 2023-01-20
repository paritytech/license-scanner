import {
  buildRoot,
  cratesDir,
  databasePath,
  extraLicenses,
  licenseAliases,
  repositoriesDir,
  rustCrateScannerRoot,
} from "license-scanner/constants";
import { ensureDatabase, getSaveScanResultItem } from "license-scanner/db";
import { getLicenseMatcher, loadLicensesNormalized, throwLicensingErrors } from "license-scanner/license";
import { Logger, LogLevel } from "license-scanner/logger";
import { scan } from "license-scanner/scanner";
import {
  DetectionOverride,
  DetectionOverrideById,
  DetectionOverrideByStartsWith,
  DetectionOverrideInput,
  ScanCliArgs,
  ScanTracker,
} from "license-scanner/types";
import { lstatAsync, readFileAsync, shouldExclude } from "license-scanner/utils";
import { dirname, join as joinPath, resolve as resolvePath } from "path";

type NextState =
  | "read startLinesExcludes"
  | "read detectionOverrides"
  | "read logLevel"
  | "read ensureLicenses"
  | "read exclude"
  | "read include"
  | null;

const detectOption = (arg: string): NextState => {
  const argIsOption = function (optionName: string) {
    return arg === `-${optionName}` || arg === `-${optionName}=`;
  };
  if (argIsOption("-start-lines-excludes")) {
    return "read startLinesExcludes";
  }
  if (argIsOption("-detection-overrides")) {
    return "read detectionOverrides";
  }
  if (argIsOption("-log-level")) {
    return "read logLevel";
  }
  if (argIsOption("-ensure-licenses")) {
    return "read ensureLicenses";
  }
  if (argIsOption("-exclude")) {
    return "read exclude";
  }
  if (argIsOption("-include")) {
    return "read include";
  }
  return null;
};

export const parseScanArgs = async function (args: string[]) {
  const scanRoots: string[] = [];
  const exclude: string[] = [];
  let startLinesExcludes: string[] | null = null;
  let detectionOverrides: DetectionOverride[] | null = null;
  let logLevel: LogLevel = "info";
  let ensureLicenses: boolean | string[] = false;

  let nextState: NextState = null;

  while (true) {
    const arg = args.shift();
    if (arg === undefined) {
      break;
    }

    console.log({arg})

    switch (nextState) {
      case "read logLevel": {
        nextState = null;

        switch (arg) {
          case "error":
          case "debug":
          case "info": {
            logLevel = arg;
            break;
          }
          default: {
            throw new Error(`Invalid log level "${arg}"`);
          }
        }
        break;
      }
      case "read startLinesExcludes": {
        nextState = null;

        startLinesExcludes = (await readFileAsync(arg)).toString().trim().split("\n");
        break;
      }
      case "read detectionOverrides": {
        nextState = null;

        const overridesFile = arg;
        const overridesFileDirectory = dirname(overridesFile);

        const parsedOverrides: DetectionOverrideInput[] = JSON.parse((await readFileAsync(overridesFile)).toString());

        const overrides: DetectionOverride[] = [];
        const uids = new Set();
        for (const { compare_with: comparisonFile, ...parsedOverride } of parsedOverrides) {
          const uid = "id" in parsedOverride ? parsedOverride.id : parsedOverride.starts_with;

          if (uids.has(uid)) {
            throw new Error(`Duplicate id ${uid} in the provided detectionOverrides`);
          } else {
            uids.add(uid);
          }

          if (typeof parsedOverride.result !== "object") {
            throw new Error(`Result of override rule ${uid} should be an object or null`);
          }

          let contents: string | null = null;
          if (comparisonFile !== undefined) {
            const path = comparisonFile.startsWith("./")
              ? joinPath(overridesFileDirectory, comparisonFile)
              : comparisonFile;
            contents = (await readFileAsync(path)).toString();
          }

          if ("id" in parsedOverride) {
            overrides.push(new DetectionOverrideById(parsedOverride.result, contents, uid));
          } else if ("starts_with" in parsedOverride) {
            overrides.push(new DetectionOverrideByStartsWith(parsedOverride.result, contents, uid));
          } else {
            const _: never = parsedOverride;
            throw new Error(`Not exhaustive parsedOverride rule: ${JSON.stringify(parsedOverride)}`);
          }
        }

        detectionOverrides = overrides;
        break;
      }
      case "read ensureLicenses": {
        nextState = null;

        if (["true", "True"].includes(arg)) {
          ensureLicenses = true;
        } else if (["false", "False"].includes(arg)) {
          ensureLicenses = false;
        } else if (typeof ensureLicenses === "boolean") {
          ensureLicenses = [arg];
        } else {
          ensureLicenses.push(arg);
        }
        break;
      }
      case "read exclude": {
        let excludeArg: string | undefined = arg;
        while (excludeArg !== undefined && detectOption(excludeArg) === null) {
          // Continue slurping exclude parameters until another option is found.
          exclude.push(excludeArg);
          excludeArg = args.shift();
        }
        nextState = excludeArg ? detectOption(excludeArg) : null;
        break;
      }
      case "read include":
      case null: {
        if (detectOption(arg) !== null) {
          nextState = detectOption(arg);
        } else {
          scanRoots.push(arg);
        }
        break;
      }
      default: {
        const _: never = nextState;
        throw new Error(`Not exhaustive nextState: ${nextState}`);
      }
    }
  }

  if (scanRoots.length === 0) {
    throw new Error("Required argument: scanRoot");
  }

  return new ScanCliArgs({
    scanRoots: scanRoots.map((scanRoot) => resolvePath(scanRoot)),
    exclude,
    startLinesExcludes,
    detectionOverrides,
    logLevel,
    ensureLicenses,
  });
};

export const executeScanArgs = async function ({
  args: { scanRoots, startLinesExcludes, detectionOverrides, logLevel, ensureLicenses, exclude },
}: ScanCliArgs) {
  console.log({scanRoots})
  const licenses = await loadLicensesNormalized(joinPath(buildRoot, "licenses"), {
    aliases: licenseAliases,
    extraLicenses,
  });

  const db = await ensureDatabase(databasePath);
  const saveScanResultItem = getSaveScanResultItem(db);

  const matchLicense = getLicenseMatcher(licenses, startLinesExcludes ?? undefined);

  const allLicensingErrors: Error[] = [];
  const logger = new Logger({ minLevel: logLevel });
  for (const scanRoot of scanRoots) {
    if (shouldExclude({ targetPath: scanRoot, initialRoot: scanRoot, exclude })) continue;
    const fileMetadata = await lstatAsync(scanRoot);
    if (!fileMetadata.isDirectory() && !fileMetadata.isFile()) {
      console.error(`ERROR: Scan target "${scanRoot}" is not a file or a directory`);
      process.exit(1);
    }
    const { licensingErrors } = await scan({
      saveResult: saveScanResultItem,
      matchLicense,
      root: scanRoot,
      initialRoot: scanRoot,
      exclude,
      dirs: { crates: cratesDir, repositories: repositoriesDir },
      rust: { shouldCheckForCargoLock: true, cargoExecPath: "cargo", rustCrateScannerRoot },
      tracker: new ScanTracker(),
      detectionOverrides: detectionOverrides ?? null,
      logger,
      ensureLicenses,
    });
    allLicensingErrors.push(...licensingErrors);
  }
  throwLicensingErrors(allLicensingErrors);
};
