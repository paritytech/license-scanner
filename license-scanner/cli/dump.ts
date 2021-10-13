import { databasePath } from "license-scanner/constants"
import { DatabaseLayout, DumpCliArgs } from "license-scanner/types"
import { readFileAsync, writeFileAsync } from "license-scanner/utils"

const formats: { [Format in DumpCliArgs["args"]["format"]]: null } = {
  csv: null,
}

export const parseDumpArgs = function (args: string[]) {
  const format = args.shift()

  if (format === undefined || !(format in formats)) {
    throw new Error(
      `Must specify the output format in the first argument. Valid ones are: ${Object.keys(
        formats,
      )}`,
    )
  }

  const outputFile = args.shift()
  if (outputFile === undefined) {
    throw new Error("Must specify the output file in the second argument")
  }

  return new DumpCliArgs({
    format: format as DumpCliArgs["args"]["format"],
    outputFile,
  })
}

const escapeValueForCsv = function (value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  switch (typeof value) {
    case "string": {
      if (value.indexOf('"') || value.indexOf(",")) {
        return `"${value.replace(/"/g, '""')}"`
      } else {
        return value
      }
    }
    default: {
      throw new Error(`Unhandled value type ${typeof value}`)
    }
  }
}

export const executeDumpArgs = async function ({
  args: { format, outputFile },
}: DumpCliArgs) {
  switch (format) {
    case "csv": {
      const db: DatabaseLayout = JSON.parse(
        (await readFileAsync(databasePath)).toString(),
      )

      const scanResult = db.scanResult ?? {}
      const lines: string[] = []
      for (const path in scanResult) {
        for (const [id, result] of Object.entries(scanResult[path])) {
          lines.push(
            `${escapeValueForCsv(id)},${escapeValueForCsv(
              "license" in result ? result.license : result.description ?? "",
            )}`,
          )
        }
      }

      await writeFileAsync(outputFile, ["id,verdict"].concat(lines).join("\n"))

      break
    }
    default: {
      const _: never = format
      throw new Error(`Format is not covered: ${format}`)
    }
  }
}
