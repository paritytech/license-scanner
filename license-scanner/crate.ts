import { dirname, join as joinPath } from "path";
import tar from "tar";

import { Logger } from "./logger";
import { downloadMutex } from "./synchronization";
import { Crate, CratesIoCrate } from "./types";
import { download, existsAsync, unlinkAsync } from "./utils";

export const getVersionedCrateName = function ({ name, version }: Pick<Crate, "name" | "version">) {
  return `${name}-${version}`;
};

// e.g. https://crates.io/api/v1/crates/addr2line/0.16.0/download
const getCrateDownloadURL = function ({ name, version }: Pick<Crate, "name" | "version">) {
  return `https://crates.io/api/v1/crates/${name}/${version}/download`;
};

const fetchCrate = async function (crate: CratesIoCrate, destination: string, logger: Logger) {
  const tarball = `${destination}.tar`;

  if (!(await existsAsync(tarball))) {
    const downloadURL = getCrateDownloadURL(crate.base);
    await downloadMutex.runExclusive(() => {
      logger.info(`Downloading ${downloadURL}`);
      return download(downloadURL, tarball);
    });
  }

  await new Promise<void>((resolve, reject) => {
    tar.x({ f: tarball, cwd: dirname(destination) }, undefined, (err) => {
      if (err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  });

  await unlinkAsync(tarball);
};

export const getOrDownloadCrate = async function (cratesDir: string, crate: CratesIoCrate, logger: Logger) {
  const cratePath = joinPath(cratesDir, getVersionedCrateName(crate.base));

  if (!(await existsAsync(cratePath))) {
    await fetchCrate(crate, cratePath, logger);
  }

  return cratePath;
};
