import { expect } from "chai";
import {
  cratesDir,
  extraLicenses,
  licenseAliases,
  projectRoot,
  repositoriesDir,
  rustCrateScannerRoot,
} from "license-scanner/constants";
import { getLicenseMatcher, loadLicensesNormalized } from "license-scanner/license";
import { Logger } from "license-scanner/logger";
import { scan } from "license-scanner/scanner";
import { ScanOptions, ScanTracker } from "license-scanner/types";
import path, { join as joinPath } from "path";
import { fileURLToPath } from "url";

describe("Scanner tests", () => {
  let scanOptions: Omit<ScanOptions, "root" | "initialRoot" | "saveResult" | "tracker">;
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
      detectionOverrides: null,
      logger: new Logger({ minLevel: "debug" }),
    };
  });

  const performScan = async (target: string) => {
    const scanRoot = path.join(targetsRoot, target);
    const output: Record<string, { description?: string; license?: string }> = {};
    await scan({
      ...scanOptions,
      saveResult: async (projectId, filePathFromRoot, result) => {
        output[filePathFromRoot] = result;
        return await Promise.resolve();
      },
      tracker: new ScanTracker(),
      root: scanRoot,
      initialRoot: scanRoot,
    });
    return output;
  };

  it("single-crate", async () => {
    const output = await performScan("single-crate");
    expect(output.LICENSE?.license).to.equal("MIT");
    expect(output["src/main.rs"]?.license).to.equal("Apache-2.0");
  });

  it("multiple-crates", async () => {
    const output = await performScan("multiple-crates");
    console.log(output);
    expect(output["first-crate/LICENSE"]?.license).to.equal("MIT");
    expect(output["first-crate/src/main.rs"]?.license).to.equal("Apache-2.0");
    expect(output["second-crate/LICENSE"]?.license).to.equal("UNLICENSE");
    expect(output["second-crate/src/main.rs"]?.license).to.equal("GPL-3.0-or-later");
  });
});
