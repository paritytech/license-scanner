import { executeDumpArgs, parseDumpArgs } from "./cli/dump"
import { executeScanArgs, parseScanArgs } from "./cli/scan"
import { DumpCliArgs, ScanCliArgs } from "./types"

const commands = {
  dump: { parse: parseDumpArgs, execute: executeDumpArgs },
  scan: { parse: parseScanArgs, execute: executeScanArgs },
}

const main = async function () {
  const cliArgs = [...process.argv.slice(2)]
  const subcommand = cliArgs.shift()

  if (subcommand === undefined) {
    throw new Error(
      `Must specify a subcommand\nThe available ones are: ${Object.keys(
        commands,
      ).join(",")}`,
    )
  }

  if (typeof subcommand !== "string" || !(subcommand in commands)) {
    throw new Error(`Invalid subcommand ${subcommand}`)
  }

  const conf = commands[subcommand as keyof typeof commands]
  const args = await conf.parse(cliArgs)

  if (args instanceof DumpCliArgs) {
    await commands.dump.execute(args)
  } else if (args instanceof ScanCliArgs) {
    await commands.scan.execute(args)
  } else {
    const _: never = args
    throw new Error(`Argument handling is not exhaustive for ${args}`)
  }
}

main()
