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

  const scanRoot = args.shift()
  if (scanRoot === undefined) {
    throw new Error(
      "Must specify the directory where the results will be dumped from",
    )
  }

  const outputFile = args.shift()
  if (outputFile === undefined) {
    throw new Error("Must specify the output file in the second argument")
  }

  return new DumpCliArgs({
    format: format as DumpCliArgs["args"]["format"],
    outputFile,
    scanRoot,
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
  args: { format, outputFile, scanRoot },
}: DumpCliArgs) {
  switch (format) {
    case "csv": {
      const db: DatabaseLayout = JSON.parse(
        (await readFileAsync(databasePath)).toString(),
      )

      const scanResult = db.scanResult
      if (scanResult === undefined) {
        throw new Error(
          `No scan result was found from the database at ${databasePath}`,
        )
      }

      const collection = scanResult[scanRoot]
      if (collection === undefined) {
        throw new Error(
          `No scan result was found for the directory "${scanRoot}" on the database ${databasePath}`,
        )
      }

      const lines: string[] = []
      for (const [id, result] of Object.entries(collection)) {
        lines.push(
          `${escapeValueForCsv(id)},${escapeValueForCsv(
            "license" in result ? result.license : result.description ?? "",
          )}`,
        )
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
