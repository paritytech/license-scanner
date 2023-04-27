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
import { Logger } from "license-scanner/logger";
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
import { dirname, join as joinPath } from "path";

export const readStartLinesExcludes = async (
  startLinesExcludes: string | undefined,
): Promise<ScanCliArgs["startLinesExcludes"]> => {
  if (!startLinesExcludes) return [];
  return (await readFileAsync(startLinesExcludes)).toString().trim().split("\n");
};

export const readEnsureLicenses = (opts: {
  ensureLicenses?: string[] | undefined;
  ensureAnyLicense?: true | undefined;
}): ScanCliArgs["ensureLicenses"] => {
  if (opts.ensureAnyLicense === true) return true;
  if (opts.ensureLicenses && opts.ensureLicenses.length > 0) return opts.ensureLicenses;
  return false;
};

export const readDetectionOverrides = async (
  overridesFile: string | undefined,
): Promise<ScanCliArgs["detectionOverrides"]> => {
  if (!overridesFile) return [];
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
      const path = comparisonFile.startsWith("./") ? joinPath(overridesFileDirectory, comparisonFile) : comparisonFile;
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

  return overrides;
};

export const executeScan = async function ({
  scanRoots,
  startLinesExcludes,
  detectionOverrides,
  logLevel,
  ensureLicenses,
  exclude,
}: ScanCliArgs) {
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
