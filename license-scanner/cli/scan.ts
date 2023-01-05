import { cratesDir, projectRoot, repositoriesDir, rustCrateScannerRoot } from "license-scanner/constants";
import { ensureDatabase, getSaveScanResultItem } from "license-scanner/db";
import { getLicenseMatcher, loadLicensesNormalized } from "license-scanner/license";
import { Logger, LogLevel } from "license-scanner/logger";
import { scan } from "license-scanner/scanner";
import {
  DetectionOverride,
  DetectionOverrideById,
  DetectionOverrideByStartsWith,
  DetectionOverrideInput,
  LicenseInput,
  ScanCliArgs,
  ScanTracker,
} from "license-scanner/types";
import { lstatAsync, readFileAsync } from "license-scanner/utils";
import { dirname, join as joinPath, resolve as resolvePath } from "path";

export const parseScanArgs = async function (args: string[]) {
  let scanRoot: string | null = null;
  let startLinesExcludes: string[] | null = null;
  let detectionOverrides: DetectionOverride[] | null = null;
  let logLevel: LogLevel = "info";

  let nextState: "read startLinesExcludes" | "read detectionOverrides" | "read logLevel" | null = null;

  while (true) {
    const arg = args.shift();
    if (arg === undefined) {
      break;
    }

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
      case null: {
        const argIsOption = function (optionName: string) {
          return arg === `-${optionName}` || arg === `-${optionName}=`;
        };
        if (argIsOption("-start-lines-excludes")) {
          nextState = "read startLinesExcludes";
        } else if (argIsOption("-detection-overrides")) {
          nextState = "read detectionOverrides";
        } else if (argIsOption("-log-level")) {
          nextState = "read logLevel";
        } else if (scanRoot) {
          throw new Error("scanRoot might only be specified once");
        } else {
          scanRoot = arg;
        }
        break;
      }
      default: {
        const _: never = nextState;
        throw new Error(`Not exhaustive nextState: ${nextState}`);
      }
    }
  }

  if (!scanRoot) {
    throw new Error("Required argument: scanRoot");
  }

  return new ScanCliArgs({
    scanRoot: resolvePath(scanRoot as string),
    startLinesExcludes,
    detectionOverrides,
    logLevel,
  });
};

export const executeScanArgs = async function ({
  args: { scanRoot, startLinesExcludes, detectionOverrides, logLevel },
}: ScanCliArgs) {
  const extraLicenses: LicenseInput[] = [
    {
      id: "GPL-3.0-only",
      text: [
        `
      you can redistribute it and/or modify it under the terms of the GNU General
      Public License as published by the Free Software Foundation, either version 3
      of the License, or (at your option) any later version.
      `,
      ],
      match: "fragment",
    },
    { id: "Apache-2.0", text: ["Licensed under the Apache License, Version 2.0"], match: "fragment" },
    { id: "MIT", text: ["Licensed under the MIT License", "Licensed under the MIT license"], match: "fragment" },
    {
      id: "MPL-2.0",
      text: ["This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0"],
      match: "fragment",
    },
    {
      id: "BSD-?",
      text: [
        "This source code is licensed under both the BSD-style license",
        "Use of this source code is governed by a BSD-style license",
      ],
      match: "fragment",
    },
    {
      id: "LICENSE",
      text: [
        "See LICENSE for licensing details.",
        "See LICENSE for licensing information.",
        "See LICENSE-APACHE, and LICENSE-MIT for details.",
        "See LICENSE-MIT for details.",
        "See LICENSE-THIRD-PARTY for details.",
        "See LICENSE-APACHE.txt, and LICENSE-MIT.txt for details.",
      ],
      match: "fragment",
      result: { description: "Defined in LICENSE for this project" },
    },
  ];

  const licenses = await loadLicensesNormalized(joinPath(projectRoot, "..", "licenses"), {
    aliases: new Map([
      ["BSD-3-CLAUSE-with-asterisks", "BSD-3-CLAUSE"],
      ["Apache-2.0-without-appendix", "Apache-2.0"],
    ]),
    extraLicenses,
  });

  const dbPath = joinPath(projectRoot, "..", "db.json");
  const db = await ensureDatabase(dbPath);
  const saveScanResultItem = getSaveScanResultItem(db);

  const matchLicense = getLicenseMatcher(licenses, startLinesExcludes ?? undefined);

  const fileMetadata = await lstatAsync(scanRoot);

  if (fileMetadata.isDirectory()) {
    await scan({
      saveResult: saveScanResultItem,
      matchLicense,
      root: scanRoot,
      initialRoot: scanRoot,
      dirs: { crates: cratesDir, repositories: repositoriesDir },
      rust: { shouldCheckForCargoLock: true, cargoExecPath: "cargo", rustCrateScannerRoot },
      tracker: new ScanTracker(),
      detectionOverrides: detectionOverrides ?? null,
      logger: new Logger({ minLevel: logLevel }),
    });
  } else if (fileMetadata.isFile()) {
    console.log(await matchLicense(scanRoot));
  } else {
    console.error(`ERROR: Scan target "${scanRoot}" is not a file or a directory`);
    process.exit(1);
  }
};
