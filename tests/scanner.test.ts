import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
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

chai.use(chaiAsPromised);

describe("Scanner tests", () => {
  let commonScanOptions: Omit<ScanOptions, "root" | "initialRoot" | "saveResult" | "tracker">;
  const targetsRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "./targets");

  before(async () => {
    const licenses = await loadLicensesNormalized(joinPath(projectRoot, "..", "licenses"), {
      aliases: licenseAliases,
      extraLicenses,
    });
    commonScanOptions = {
      matchLicense: getLicenseMatcher(licenses),
      dirs: { crates: cratesDir, repositories: repositoriesDir },
      rust: { shouldCheckForCargoLock: true, cargoExecPath: "cargo", rustCrateScannerRoot },
      detectionOverrides: null,
      logger: new Logger({ minLevel: "info" }),
    };
  });

  const performScan = async (target: string, overrideScanOptions?: Partial<ScanOptions>) => {
    const scanRoot = path.join(targetsRoot, target);
    const output: Record<string, { description?: string; license?: string }> = {};
    await scan({
      ...commonScanOptions,
      saveResult: async (projectId, filePathFromRoot, result) => {
        output[filePathFromRoot] = result;
        return await Promise.resolve();
      },
      tracker: new ScanTracker(),
      root: scanRoot,
      initialRoot: scanRoot,
      ...overrideScanOptions,
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
    expect(output["first-crate/LICENSE"]?.license).to.equal("MIT");
    expect(output["first-crate/src/main.rs"]?.license).to.equal("Apache-2.0");
    expect(output["second-crate/LICENSE"]?.license).to.equal("UNLICENSE");
    expect(output["second-crate/src/main.rs"]?.license).to.equal("GPL-3.0-or-later");
  });

  describe("ensure license", async () => {
    it("works when file properly licensed", async () => {
      const output = await performScan("required-license/src/licensed", { ensureLicenses: ["Apache-2.0"] });
      expect(output["main.rs"]?.license).to.equal("Apache-2.0");
    });

    it("throws when file not licensed", async () => {
      await expect(
        performScan("required-license/src/not-licensed", { ensureLicenses: ["Apache-2.0"] }),
      ).to.eventually.be.rejectedWith("Ensuring files have license failed: No license detected in main.rs");

      await expect(
        performScan("required-license/src/not-licensed", { ensureLicenses: true }),
      ).to.eventually.be.rejectedWith("Ensuring files have license failed: No license detected in main.rs");
    });

    it("throws when file copyrighted but not licensed", async () => {
      await expect(
        performScan("required-license/src/copyrighted", { ensureLicenses: ["Apache-2.0"] }),
      ).to.eventually.be.rejectedWith(
        'Ensuring files have license failed: main.rs resulted in: Flagged because "copyright" was found somewhere within this file, but no licenses were detected',
      );

      await expect(
        performScan("required-license/src/copyrighted", { ensureLicenses: true }),
      ).to.eventually.be.rejectedWith(
        'Ensuring files have license failed: main.rs resulted in: Flagged because "copyright" was found somewhere within this file, but no licenses were detected',
      );
    });

    it("throws when file licensed differently", async () => {
      await expect(
        performScan("required-license/src/licensed-differently", { ensureLicenses: ["Apache-2.0"] }),
      ).to.eventually.be.rejectedWith(
        "Ensuring files have license failed: main.rs has MIT license, expected one of: Apache-2.0",
      );

      const output = await performScan("required-license/src/licensed-differently", { ensureLicenses: true });
      expect(output["main.rs"]?.license).to.equal("MIT");
    });
  });
});
