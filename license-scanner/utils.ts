import cp from "child_process"
import fs from "fs"
import fetch from "node-fetch"
import path from "path"
import stream from "stream"
import { promisify } from "util"

const streamPipelineAsync = promisify(stream.pipeline)
export const readFileAsync = promisify(fs.readFile)
export const readdirAsync = promisify(fs.readdir)
export const renameAsync = promisify(fs.rename)
export const unlinkAsync = promisify(fs.unlink)
export const existsAsync = promisify(fs.exists)
export const lstatAsync = promisify(fs.lstat)
const mkdirAsync = promisify(fs.mkdir)

export const walkFiles: (
  dir: string,
) => AsyncGenerator<{ path: string; name: string }> = async function* (dir) {
  for await (const d of await fs.promises.opendir(dir)) {
    const fullPath = path.join(dir, d.name)
    if (d.isDirectory()) {
      yield* walkFiles(fullPath)
    } else {
      yield { path: fullPath, name: d.name }
    }
  }
}

export const loadFiles = async function (
  root: string,
  mapContents: (text: string) => string = function (text: string) {
    return text
  },
) {
  const result: Record<string, string> = {}
  const seenNames: Record<string, string> = {}
  for await (const file of walkFiles(root)) {
    const prevLocation = seenNames[file.name]
    if (prevLocation) {
      throw new Error(
        `Found file with duplicate name at ${file.path} (previously seen in ${prevLocation})`,
      )
    }

    seenNames[file.name] = file.path
    result[file.name] = mapContents((await readFileAsync(file.path)).toString())
  }
  return result
}

export const ensureDir = async function (dir: string) {
  if (!(await existsAsync(dir))) {
    await mkdirAsync(dir, { recursive: true })
  }
  return dir
}

export const download = async function (url: string, targetPath: string) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Unexpected response ${response.statusText} for ${url}`)
  } else if (response.body === null) {
    throw new Error(`Response of ${url} had no body`)
  }

  await streamPipelineAsync(response.body, fs.createWriteStream(targetPath))
}

export const execute = function (
  cmd: string,
  args: string[],
  options: Omit<cp.SpawnOptions, "stdio">,
) {
  return new Promise<string>(function (resolve) {
    const child = cp.spawn(cmd, args, { ...options, stdio: "pipe" })

    let stdoutBuf = ""
    child.stdout.on("data", function (data) {
      stdoutBuf += data.toString()
    })

    child.on("close", function () {
      resolve(stdoutBuf.trim())
    })
  })
}

export const isBinaryFile = function (file: string) {
  return new Promise<boolean>(function (resolve) {
    const child = cp.spawn("readelf", ["-h", file], { stdio: "ignore" })
    child.on("close", function (code) {
      resolve(code === 0 ? true : false)
    })
  })
}
