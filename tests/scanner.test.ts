import {
  buildRoot,
  cratesDir,
  extraLicenses,
  licenseAliases,
  repositoriesDir,
  rustCrateScannerRoot,
} from "#license-scanner/constants";
import { getLicenseMatcher, loadLicensesNormalized } from "#license-scanner/license";
import { Logger } from "#license-scanner/logger";
import { scan } from "#license-scanner/scanner";
import { ScanOptions, ScanTracker } from "#license-scanner/types";
import { expect } from "earl";
import { before, describe, it } from "node:test";
import path from "path";

await describe("Scanner tests", async () => {
  let commonScanOptions: Omit<ScanOptions, "root" | "initialRoot" | "saveResult" | "tracker">;
  const targetsRoot = path.join(process.cwd(), "tests/targets");

  before(async () => {
    const licenses = await loadLicensesNormalized(path.join(buildRoot, "licenses"), {
      aliases: licenseAliases,
      extraLicenses,
    });
    commonScanOptions = {
      matchLicense: getLicenseMatcher(licenses),
      dirs: { crates: cratesDir, repositories: repositoriesDir },
      rust: { shouldCheckForCargoLock: true, cargoExecPath: "cargo", rustCrateScannerRoot },
      detectionOverrides: [],
      logger: new Logger({ minLevel: process.env.DEBUG ? "debug" : "info" }),
      fileExtensions: [],
      exclude: [],
    };
  });

  const performScan = async (target: string, overrideScanOptions?: Partial<ScanOptions>) => {
    const scanRoot = path.join(targetsRoot, target);
    const output: Record<string, { description?: string; license?: string }> = {};
    const { licensingErrors } = await scan({
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
    return { output, licensingErrors };
  };

  await it("single-crate", async () => {
    const { output, licensingErrors } = await performScan("single-crate");
    expect(licensingErrors.length).toEqual(0);
    expect(output.LICENSE?.license).toEqual("MIT");
    expect(output["src/main.rs"]?.license).toEqual("Apache-2.0");
  });

  await it("single-crate, targeting a single file", async () => {
    const { output, licensingErrors } = await performScan("single-crate/src/main.rs");
    expect(licensingErrors.length).toEqual(0);
    expect(output[""]?.license).toEqual("Apache-2.0");
  });

  await it("multiple-crates", async () => {
    const { output, licensingErrors } = await performScan("multiple-crates");
    expect(licensingErrors.length).toEqual(0);
    expect(output["first-crate/LICENSE"]?.license).toEqual("MIT");
    expect(output["first-crate/src/main.rs"]?.license).toEqual("Apache-2.0");
    expect(output["second-crate/LICENSE"]?.license).toEqual("UNLICENSE");
    expect(output["second-crate/src/main.rs"]?.license).toEqual("GPL-3.0-or-later");
  });

  // Takes some time because it downloads the crates from the Internet.
  await it("crate-with-dependencies", { timeout: 120_000 }, async () => {
    const { output, licensingErrors } = await performScan("crate-with-dependencies");
    expect(licensingErrors.length).toEqual(0);
    expect(output["async-trait-0.1.61 file: Cargo.toml"]?.license).toEqual("MIT OR Apache-2.0");
    expect(output["futures-0.4.0-alpha.0 file: Cargo.toml"]?.license).toEqual("MIT OR Apache-2.0");
  });

  await describe("crates with inherited properties", async () => {
    await it("targeting the workspace", async () => {
      const { output, licensingErrors } = await performScan("inherited-properties");
      expect(licensingErrors.length).toEqual(0);

      // Workspace root.
      expect(output["Cargo.toml"]?.license).toEqual("MIT");
      expect(output["src/main.rs"]?.license).toEqual("Apache-2.0");

      // Subpackages.
      expect(output["subpackage-inherited/src/main.rs"]?.license).toEqual("Apache-2.0");
      expect(output["subpackage-set/src/main.rs"]?.license).toEqual("Apache-2.0");
    });

    await it("targeting a crate with inherited property directly", async () => {
      const { output, licensingErrors } = await performScan("inherited-properties/subpackage-inherited");
      expect(licensingErrors.length).toEqual(0);

      expect(output["src/main.rs"]?.license).toEqual("Apache-2.0");
    });
  });

  await describe("ensure license", async () => {
    await it("works when file properly licensed", async () => {
      const { output, licensingErrors } = await performScan("required-license/src/licensed", {
        ensureLicenses: ["Apache-2.0"],
      });
      expect(licensingErrors.length).toEqual(0);
      expect(output["main.rs"]?.license).toEqual("Apache-2.0");
    });

    await it("throws when file not licensed", async () => {
      {
        const { licensingErrors } = await performScan("required-license/src/not-licensed", {
          ensureLicenses: ["Apache-2.0"],
        });
        expect(licensingErrors.length).toEqual(1);
        expect(licensingErrors[0].toString()).toInclude("No license detected in main.rs");
      }

      {
        const { licensingErrors } = await performScan("required-license/src/not-licensed", { ensureLicenses: true });
        expect(licensingErrors.length).toEqual(1);
        expect(licensingErrors[0].toString()).toInclude("No license detected in main.rs");
      }
    });

    await it("throws when file copyrighted but not licensed", async () => {
      {
        const { licensingErrors } = await performScan("required-license/src/copyrighted", {
          ensureLicenses: ["Apache-2.0"],
        });
        expect(licensingErrors.length).toEqual(1);
        expect(licensingErrors[0].toString()).toInclude(
          'main.rs resulted in: Flagged because "copyright" was found somewhere within this file, but no licenses were detected',
        );
      }

      {
        const { licensingErrors } = await performScan("required-license/src/copyrighted", { ensureLicenses: true });
        expect(licensingErrors.length).toEqual(1);
        expect(licensingErrors[0].toString()).toInclude(
          'main.rs resulted in: Flagged because "copyright" was found somewhere within this file, but no licenses were detected',
        );
      }
    });

    await it("throws when file licensed differently", async () => {
      {
        const { licensingErrors } = await performScan("required-license/src/licensed-differently", {
          ensureLicenses: ["Apache-2.0"],
        });
        expect(licensingErrors.length).toEqual(1);
        expect(licensingErrors[0].toString()).toInclude("main.rs has MIT license, expected one of: Apache-2.0");
      }

      {
        const { output, licensingErrors } = await performScan("required-license/src/licensed-differently", {
          ensureLicenses: true,
        });
        expect(licensingErrors.length).toEqual(0);
        expect(output["main.rs"]?.license).toEqual("MIT");
      }
    });

    await it("throws when file licensed differently than specified in Cargo manifest", async () => {
      const scanOpts: Partial<ScanOptions> = { ensureLicenses: ["Apache-2.0", "MIT"], fileExtensions: [".rs"] };

      {
        const { licensingErrors } = await performScan("manifest-license", scanOpts);
        expect(licensingErrors.length).toEqual(2);
        expect(licensingErrors.find((e) => e.message.includes("main.rs"))!.toString()).toInclude(
          "main.rs has MIT license, expected Apache-2.0 as in cargo manifest.",
        );
        expect(licensingErrors.find((e) => e.message.includes("build.rs"))!.toString()).toInclude(
          "build.rs has MIT license, expected Apache-2.0 as in cargo manifest.",
        );
      }

      // The licenses should be OK on their own, they only conflict if the Cargo manifest is considered.
      {
        const { output, licensingErrors } = await performScan("manifest-license/src/licensed", scanOpts);
        expect(licensingErrors.length).toEqual(0);
        expect(output["main.rs"]?.license).toEqual("Apache-2.0");
      }
      {
        const { output, licensingErrors } = await performScan("manifest-license/src/licensed-differently", scanOpts);
        expect(licensingErrors.length).toEqual(0);
        expect(output["main.rs"]?.license).toEqual("MIT");
      }
    });

    await it("throws when file licensed differently, targeting a single file", async () => {
      {
        const { licensingErrors } = await performScan("required-license/src/licensed-differently/main.rs", {
          ensureLicenses: ["Apache-2.0"],
        });
        expect(licensingErrors.length).toEqual(1);
        expect(licensingErrors[0].toString()).toInclude("main.rs has MIT license, expected one of: Apache-2.0");
      }

      {
        const { output, licensingErrors } = await performScan("required-license/src/licensed-differently/main.rs", {
          ensureLicenses: true,
        });
        expect(licensingErrors.length).toEqual(0);
        expect(output[""]?.license).toEqual("MIT");
      }
    });
  });

  await describe("excluding files", async () => {
    await it("Can exclude a file", async () => {
      {
        // No exclude for comparison.
        const { output } = await performScan("single-crate");
        expect(output.LICENSE?.license).toEqual("MIT");
        expect(output["src/main.rs"]?.license).toEqual("Apache-2.0");
      }
      {
        // Exclude a relative path from target root.
        const { output } = await performScan("single-crate", { exclude: ["src/main.rs"] });
        expect(output.LICENSE?.license).toEqual("MIT");
        expect(output["src/main.rs"]).toBeNullish();
      }
      {
        // Exclude a relative path from CWD.
        const { output } = await performScan("single-crate", { exclude: ["./tests/targets/single-crate/src/main.rs"] });
        expect(output.LICENSE?.license).toEqual("MIT");
        expect(output["src/main.rs"]).toBeNullish();
      }
      {
        // Exclude an absolute path.
        const { output } = await performScan("single-crate", {
          exclude: [path.join(targetsRoot, "single-crate/src/main.rs")],
        });
        expect(output.LICENSE?.license).toEqual("MIT");
        expect(output["src/main.rs"]).toBeNullish();
      }
    });

    await it("Can exclude a directory", async () => {
      {
        // No exclude for comparison.
        const { output } = await performScan("single-crate");
        expect(output.LICENSE?.license).toEqual("MIT");
        expect(output["src/main.rs"]?.license).toEqual("Apache-2.0");
      }
      {
        // Exclude a relative path from target root.
        const { output } = await performScan("single-crate", { exclude: ["src"] });
        expect(output.LICENSE?.license).toEqual("MIT");
        expect(output["src/main.rs"]).toBeNullish();
      }
      {
        // Exclude a relative path from CWD.
        const { output } = await performScan("single-crate", { exclude: ["./tests/targets/single-crate/src"] });
        expect(output.LICENSE?.license).toEqual("MIT");
        expect(output["src/main.rs"]).toBeNullish();
      }
      {
        const { output } = await performScan("single-crate", { exclude: [path.join(targetsRoot, "single-crate/src")] });
        expect(output.LICENSE?.license).toEqual("MIT");
        expect(output["src/main.rs"]).toBeNullish();
      }
    });

    await it("Can exclude a path above the target root", async () => {
      {
        // Exclude a relative path from target root.
        const { output } = await performScan("single-crate", { exclude: [targetsRoot] });
        expect(output).toEqual({});
      }
    });

    await it("Can exclude files by specifying extensions", async () => {
      {
        const { output } = await performScan("single-crate", {});
        expect(typeof output.LICENSE?.license).toEqual("string");
        expect(typeof output["src/main.rs"]?.license).toEqual("string");
      }

      {
        const { output } = await performScan("single-crate", { fileExtensions: [".rs"] });
        expect(output.LICENSE?.license).toBeNullish();
        expect(typeof output["src/main.rs"]?.license).toEqual("string");
      }
    });
  });
});
