import { executeScanArgs } from "license-scanner/cli/scan";
import path, {join as joinPath} from "path";
import { fileURLToPath } from "url";
import {getLicenseMatcher, loadLicensesNormalized} from "../license-scanner/license";
import {
  cratesDir,
  extraLicenses,
  licenseAliases,
  projectRoot,
  repositoriesDir,
  rustCrateScannerRoot
} from "../license-scanner/constants";
import {scan} from "../license-scanner/scanner";
import {ScanOptions, ScanResultItem, ScanTracker} from "../license-scanner/types";
import {Logger} from "../license-scanner/logger";

describe("Scanner tests", () => {
  let scanOptions: Omit<ScanOptions, "root" | "initialRoot" | "saveResult">
  const targetsRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "./targets");

  before(async () => {
    const licenses = await loadLicensesNormalized(joinPath(projectRoot, "..", "licenses"), {
      aliases: licenseAliases,
      extraLicenses,
    });
    scanOptions = {
      matchLicense: getLicenseMatcher(licenses),
      dirs: { crates: cratesDir, repositories: repositoriesDir },
      rust: { shouldCheckForCargoLock: true, cargoExecPath: "cargo", rustCrateScannerRoot },
      tracker: new ScanTracker(),
      detectionOverrides: null,
      logger: new Logger({ minLevel: 'debug' }),
    }
  });

  const performScan = async (target: string) => {
    const scanRoot = path.join(targetsRoot, "single-crate");
    const output: Record<string, ScanResultItem> = {}
    await scan({
      ...scanOptions,
      saveResult: async (projectId, filePathFromRoot, result) => {
        output[filePathFromRoot] = result
      },
      root: scanRoot,
      initialRoot: scanRoot,
    });
    return output
  }

  it("single-crate", async () => {
    const output = await performScan("single-crate")
    console.log(output)
  })

  it("multiple-crates", async () => {
    const output = await performScan("multiple-crates")
    console.log(output)
  })
});
