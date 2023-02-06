#!/usr/bin/env -S node --es-module-specifier-resolution=node

import { Command, Option } from "@commander-js/extra-typings";
import { Logger, LogLevel } from "license-scanner/logger";
import { resolve as resolvePath } from "path";

import { executeDump } from "./cli/dump";
import { executeScan, readDetectionOverrides, readEnsureLicenses, readStartLinesExcludes } from "./cli/scan";

const program = new Command("license-scanner").description(
  `license-scanner does not provide legal advice and it is not a lawyer. Licenses
are identified exclusively by automated means, without any step of human
verification, and thus the verdict is subject to bugs in the software and
incomplete heuristics which might yield false positives.

license-scanner aims to provide best-effort automated license scanning.
Regardless of how well it performs, its accuracy should not be relied upon as
the ultimate verdict for legal purposes. You should seek independent legal
advice for any licensing questions that may arise from using this tool.
`,
);

const logOption = new Option("--log-level <level>").choices(["error", "debug", "info"]).default("info");

program
  .command("scan")
  .description(`Perform a scan trying to detect licenses in the target files.`)
  .argument("<scanRoots...>")
  .addOption(
    new Option<"--log-level <level>", LogLevel>("--log-level <level>")
      .choices(["error", "debug", "info"] as const)
      .default("info"),
  )
  .option(
    "--detection-overrides <detectionOverrides>",
    "Takes as argument a configuration file specifying Override Rules ([example](https://github.com/paritytech/license-scanner/blob/master/example/detection-overrides.json)) which can be used to override the automatic detection.",
  )
  .option(
    "--start-lines-excludes <startLineExcludes>",
    "Takes as argument a plain-text file which specifies lines to be excluded from the top of the file during the text normalization step",
  )
  .addOption(
    new Option(
      "--ensure-licenses <licenses...>",
      "If configured, the scan will make sure that all scanned files are licensed with one of the listed licenses.",
    ).conflicts("ensureAnyLicense"),
  )
  .addOption(
    new Option(
      "--ensure-any-license",
      "If configured, the scan will make sure that all scanned files are licensed with any license.",
    ).conflicts("ensureLicenses"),
  )
  .option("--exclude <exclude...>", "Can be used to exclude files or directories from the scan.")
  // It's actually correct usage but @commander-js/extra-typings is wrong on this one.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  .action(async (scanRoots, options) => {
    const logger = new Logger({ minLevel: options.logLevel as LogLevel });
    try {
      await executeScan({
        scanRoots: scanRoots.map((scanRoot) => resolvePath(scanRoot)),
        startLinesExcludes: await readStartLinesExcludes(options.startLinesExcludes),
        detectionOverrides: await readDetectionOverrides(options.detectionOverrides),
        exclude: options.exclude ?? [],
        logLevel: options.logLevel as LogLevel,
        ensureLicenses: readEnsureLicenses(options),
      });
    } catch (e: any) {
      logger.debug(e.stack);
      program.error(e.message);
    }
  });

program
  .command("dump")
  .description(`After the scan is complete it can optionally be dumped into a CSV file.`)
  .argument("Scan root <scanRoot>", `The directory where the results of a scan are.`)
  .argument("outputFile <outputFile>", "Output path or filename.")
  .addOption(logOption)
  // It's actually correct usage but @commander-js/extra-typings is wrong on this one.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  .action(async (scanRoot, outputFile, options) => {
    const logger = new Logger({ minLevel: options.logLevel as LogLevel });
    try {
      await executeDump({ scanRoot, outputFile });
    } catch (e: any) {
      logger.debug(e.stack);
      program.error(e.message);
    }
  });

program.parseAsync().catch((e) => {
  console.error(e.toString());
  process.exit(1);
});
