#!/usr/bin/env -S node --es-module-specifier-resolution=node

import { Command, Option } from '@commander-js/extra-typings';

import { executeDumpArgs, parseDumpArgs } from "./cli/dump";
import { executeScanArgs, parseScanArgs } from "./cli/scan";
import { DumpCliArgs, ScanCliArgs } from "./types";
import {LogLevel} from "license-scanner/logger";

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

program.command('scan')
  .description(`Perform a scan trying to detect licenses in the target files.`)
  .argument('<scanRoots...>')
  .option('--detection-overrides <detectionOverrides>', 'Takes as argument a configuration file specifying Override Rules ([example](https://github.com/paritytech/license-scanner/blob/master/example/detection-overrides.json)) which can be used to override the automatic detection.')
  .option('--start-lines-excludes <startLineExcludes>', 'Takes as argument a plain-text file which specifies lines to be excluded from the top of the file during the text normalization step')
  .addOption(new Option('--log-level <level>').choices(["error", "debug", "info"]))
  .option('--ensure-licenses <license>', 'If configured, the scan will make sure that all scanned files are licensed.')
  .option('--exclude <exclude...>', 'Can be used to exclude files or directories from the scan.')
  .action((scanRoots, options) => {
    console.log({scanRoots, options})
  })

program.command('dump')
  .description(`After the scan is complete it can optionally be dumped into a CSV file.`)
  .argument("Scan root <scanRoot>", `The directory where the results of a scan are.`)
  .argument('outputFile <outputFile>', 'Output path or filename.')
  .action((scanRoot, outputFile) => {
    console.log('dump options:', {scanRoot, outputFile})
  })

program.parse();

// const options = program.opts();
// const args = program.args;
// console.log({options, args})

process.exit(0);

const subcommands = {
  dump: { parse: parseDumpArgs, execute: executeDumpArgs },
  scan: { parse: parseScanArgs, execute: executeScanArgs },
};

const main = async function () {
  const cliArgs = [...process.argv.slice(2)];
  const subcommand = cliArgs.shift();

  try {
    if (subcommand === undefined) {
      throw new Error(`Must specify a subcommand\nThe available ones are: ${Object.keys(subcommands).join(",")}`);
    }

    if (typeof subcommand !== "string" || !(subcommand in subcommands)) {
      throw new Error(`Invalid subcommand ${subcommand}. Valid ones are: ${Object.keys(subcommands)}`);
    }

    const conf = subcommands[subcommand as keyof typeof subcommands];
    const args = await conf.parse(cliArgs);

    if (args instanceof DumpCliArgs) {
      await subcommands.dump.execute(args);
    } else if (args instanceof ScanCliArgs) {
      await subcommands.scan.execute(args);
    } else {
      const _: never = args;
      throw new Error(`Argument handling is not exhaustive for ${args}`);
    }
  } catch (error: unknown) {
    console.error((error as Error).toString());
    process.exit(1);
  }
};

await main();
