import cp from "child_process";
import { open as openElf } from "elfinfo";
import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import stream from "stream";
import { promisify } from "util";

const streamPipelineAsync = promisify(stream.pipeline);
export const readFileAsync = promisify(fs.readFile);
export const readdirAsync = promisify(fs.readdir);
export const renameAsync = promisify(fs.rename);
export const unlinkAsync = promisify(fs.unlink);
export const existsAsync = promisify(fs.exists);
export const lstatAsync = promisify(fs.lstat);
export const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

export const walkFiles: (
  dir: string,
  options?: {
    manifestLicense?: string;
    excluding?: { initialRoot: string; exclude: string[] };
  },
) => AsyncGenerator<{ path: string; name: string; manifestLicense?: string }> = async function* (dir, options = {}) {
  const { excluding } = options;
  if ((await lstatAsync(dir)).isFile()) {
    if (excluding && shouldExclude({ targetPath: dir, ...excluding })) return;
    yield { path: dir, name: path.basename(dir), manifestLicense: options.manifestLicense };
    return;
  }

  let manifestLicense = options.manifestLicense;
  const rootCargoToml = path.join(dir, "Cargo.toml");
  if (await existsAsync(rootCargoToml)) {
    const manifest = fs.readFileSync(rootCargoToml, "utf-8");
    manifestLicense = manifest.match(/license = "(.*)"/)?.[1];
  }

  for await (const d of await fs.promises.opendir(dir)) {
    const fullPath = path.join(dir, d.name);
    if (excluding && shouldExclude({ targetPath: fullPath, ...excluding })) continue;
    if (d.isDirectory()) {
      yield* walkFiles(fullPath, { excluding, manifestLicense });
    } else {
      yield { path: fullPath, name: d.name, manifestLicense };
    }
  }
};

export const loadFiles = async function (
  root: string,
  mapContents: (text: string) => string = function (text: string) {
    return text;
  },
) {
  const result: Record<string, string> = {};
  const seenNames: Record<string, string> = {};
  for await (const file of walkFiles(root)) {
    const prevLocation = seenNames[file.name];
    if (prevLocation) {
      throw new Error(`Found file with duplicate name at ${file.path} (previously seen in ${prevLocation})`);
    }

    seenNames[file.name] = file.path;
    result[file.name] = mapContents((await readFileAsync(file.path)).toString());
  }
  return result;
};

export const ensureDir = async function (dir: string) {
  if (!(await existsAsync(dir))) {
    await mkdirAsync(dir, { recursive: true });
  }
  return dir;
};

export const download = async function (url: string, targetPath: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unexpected response ${response.statusText} for ${url}`);
  } else if (response.body === null) {
    throw new Error(`Response of ${url} had no body`);
  }

  await streamPipelineAsync(response.body, fs.createWriteStream(targetPath));
};

export const execute = function (cmd: string, args: string[], options: Omit<cp.SpawnOptions, "stdio">) {
  return new Promise<{ stdout: string; stderr: string }>((resolve) => {
    const child = cp.spawn(cmd, args, { ...options, stdio: "pipe" });

    let stderrBuf = "";
    child.stderr.on("data", (data) => {
      stderrBuf += data.toString();
    });

    let stdoutBuf = "";
    child.stdout.on("data", (data) => {
      stdoutBuf += data.toString();
    });

    child.on("close", () => {
      resolve({ stdout: stdoutBuf.trim(), stderr: stderrBuf.trim() });
    });
  });
};

export const isBinaryFile = async function (file: string) {
  const fileData = await fs.promises.open(file, "r");
  const elfData = await openElf(fileData);
  await fileData.close();
  return elfData.success;
};

export function shouldExclude(options: { targetPath: string; initialRoot: string; exclude: string[] }) {
  const { targetPath, initialRoot, exclude } = options;
  for (const excl of exclude) {
    // Relative exclude from target root:
    if (targetPath.includes(path.join(initialRoot, excl))) return true;

    // Relative exclude from CWD:
    if (targetPath.includes(path.resolve(excl))) return true;

    // Absolute exclude:
    if (targetPath === excl) return true;
  }
  return false;
}
