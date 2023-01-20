#!/usr/bin/env -S node --es-module-specifier-resolution=node

console.log("I AM HERE")

import { executeDumpArgs, parseDumpArgs } from "./cli/dump";
import { executeScanArgs, parseScanArgs } from "./cli/scan";
import { DumpCliArgs, ScanCliArgs } from "./types";

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
