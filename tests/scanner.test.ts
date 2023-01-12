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
import path from "path";

chai.use(chaiAsPromised);

describe("Scanner tests", () => {
  let commonScanOptions: Omit<ScanOptions, "root" | "initialRoot" | "saveResult" | "tracker">;
  const targetsRoot = path.join(projectRoot, "tests/targets");

  before(async () => {
    const licenses = await loadLicensesNormalized(path.join(projectRoot, "licenses"), {
      aliases: licenseAliases,
      extraLicenses,
    });
    commonScanOptions = {
      matchLicense: getLicenseMatcher(licenses),
      dirs: { crates: cratesDir, repositories: repositoriesDir },
      rust: { shouldCheckForCargoLock: true, cargoExecPath: "cargo", rustCrateScannerRoot },
      detectionOverrides: null,
      logger: new Logger({ minLevel: process.env.DEBUG ? "debug" : "info" }),
    };
  });

  const performScan = async (target: string, overrideScanOptions?: Partial<ScanOptions>) => {
    const scanRoot = path.join(targetsRoot, target);
    const output: Record<string, { description?: string; license?: string }> = {};
    const {licensingErrors} = await scan({...commonScanOptions,
      saveResult: async (projectId, filePathFromRoot, result) => {
        output[filePathFromRoot] = result;
        return await Promise.resolve();
      },
      tracker: new ScanTracker(),
      root: scanRoot,
      initialRoot: scanRoot,
      ...overrideScanOptions,
    });
    return {output, licensingErrors};
  };

  it("single-crate", async () => {
    const {output, licensingErrors} = await performScan("single-crate");
    expect(licensingErrors.length).to.eq(0)
    expect(output.LICENSE?.license).to.equal("MIT");
    expect(output["src/main.rs"]?.license).to.equal("Apache-2.0");
  });

  it("single-crate, targeting a single file", async () => {
    const {output, licensingErrors} = await performScan("single-crate/src/main.rs");
    expect(licensingErrors.length).to.eq(0)
    expect(output[""]?.license).to.equal("Apache-2.0");
  });

  it("multiple-crates", async () => {
    const {output, licensingErrors} = await performScan("multiple-crates");
    expect(licensingErrors.length).to.eq(0)
    expect(output["first-crate/LICENSE"]?.license).to.equal("MIT");
    expect(output["first-crate/src/main.rs"]?.license).to.equal("Apache-2.0");
    expect(output["second-crate/LICENSE"]?.license).to.equal("UNLICENSE");
    expect(output["second-crate/src/main.rs"]?.license).to.equal("GPL-3.0-or-later");
  });

  it("create-with-dependencies", async () => {
    const {output, licensingErrors} = await performScan("crate-with-dependencies");
    expect(licensingErrors.length).to.eq(0)
    expect(output["async-trait-0.1.61 file: Cargo.toml"]?.license).to.equal("MIT OR Apache-2.0");
    expect(output["futures-0.4.0-alpha.0 file: Cargo.toml"]?.license).to.equal("MIT OR Apache-2.0");
  }).timeout(120_000); // Takes some time because it downloads the crates from the Internet.

  describe("ensure license", () => {
    it("works when file properly licensed", async () => {
      const {output, licensingErrors} = await performScan("required-license/src/licensed", { ensureLicenses: ["Apache-2.0"] });
      expect(licensingErrors.length).to.eq(0)
      expect(output["main.rs"]?.license).to.equal("Apache-2.0");
    });

    it("throws when file not licensed", async () => {
      {
        const {output, licensingErrors} = await performScan("required-license/src/not-licensed", { ensureLicenses: ["Apache-2.0"] })
        expect(licensingErrors.length).to.eq(1)
        expect(licensingErrors[0].toString()).to.include("Ensuring files have license failed: No license detected in main.rs")
      }

      {
        const {output, licensingErrors} = await performScan("required-license/src/not-licensed", { ensureLicenses: true })
        expect(licensingErrors.length).to.eq(1)
        expect(licensingErrors[0].toString()).to.include("Ensuring files have license failed: No license detected in main.rs")
      }
    });

    it("throws when file copyrighted but not licensed", async () => {
      {
        const {output, licensingErrors} = await performScan("required-license/src/copyrighted", { ensureLicenses: ["Apache-2.0"] })
        expect(licensingErrors.length).to.eq(1)
        expect(licensingErrors[0].toString()).to.include(
          'Ensuring files have license failed: main.rs resulted in: Flagged because "copyright" was found somewhere within this file, but no licenses were detected'
        )
      }

      {
        const {output, licensingErrors} = await performScan("required-license/src/copyrighted", { ensureLicenses: true })
        expect(licensingErrors.length).to.eq(1)
        expect(licensingErrors[0].toString()).to.include(
          'Ensuring files have license failed: main.rs resulted in: Flagged because "copyright" was found somewhere within this file, but no licenses were detected'
        )
      }
    });

    it("throws when file licensed differently", async () => {
      {
        const {output, licensingErrors} = await performScan("required-license/src/licensed-differently", { ensureLicenses: ["Apache-2.0"] })
        expect(licensingErrors.length).to.eq(1)
        expect(licensingErrors[0].toString()).to.include("Ensuring files have license failed: main.rs has MIT license, expected one of: Apache-2.0")
      }

      {
        const {output, licensingErrors} = await performScan("required-license/src/licensed-differently", { ensureLicenses: true });
        expect(output["main.rs"]?.license).to.equal("MIT");
      }
    });

    it("throws when file licensed differently, targeting a single file", async () => {
      {
        const {output, licensingErrors} = await performScan("required-license/src/licensed-differently/main.rs", { ensureLicenses: ["Apache-2.0"] })
        expect(licensingErrors.length).to.eq(1)
        expect(licensingErrors[0].toString()).to.include("Ensuring files have license failed: main.rs has MIT license, expected one of: Apache-2.0")
      }

      {
        const {output, licensingErrors} = await performScan("required-license/src/licensed-differently/main.rs", { ensureLicenses: true });
        expect(output[""]?.license).to.equal("MIT");
      }
    });
  });
});
