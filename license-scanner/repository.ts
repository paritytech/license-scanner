import assert from "assert";
import { basename, join as joinPath } from "path";
import tar from "tar";
import tmp from "tmp";

import { Logger } from "./logger.js";
import { downloadMutex } from "./synchronization.js";
import { RepositoryCrate } from "./types.js";
import { download, ensureDir, existsAsync, readdirAsync, renameAsync, unlinkAsync } from "./utils.js";

const getVersionedRepositoryName = function (crate: RepositoryCrate) {
  return `${basename(crate.source.repository)}-${crate.source.ref.value}`;
};

// e.g. https://github.com/org/repo/tarball/[tag,ref,sha]
const getRepositoryDownloadUrl = function (crate: RepositoryCrate) {
  return `${crate.source.repository}/tarball/${crate.source.ref.value}`;
};

const fetchRepository = async function (tmpDir: string, crate: RepositoryCrate, destination: string, logger: Logger) {
  const tarball = `${destination}.tar`;
  if (!(await existsAsync(tarball))) {
    await downloadMutex.runExclusive(() => {
      logger.info(`Downloading repository ${crate.source.repository} (ref: ${crate.source.ref.value})`);
      return download(getRepositoryDownloadUrl(crate), tarball);
    });
  }

  const extractionDir = await new Promise<{ path: string; remove: () => void }>((resolve, reject) => {
    tmp.dir({ tmpdir: tmpDir }, (err, path, remove) => {
      if (err === null || err === undefined) {
        resolve({ path, remove });
      } else {
        reject(err);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    tar.x({ f: tarball, cwd: extractionDir.path }, undefined, (err) => {
      if (err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  });

  const extractedFolders = await readdirAsync(extractionDir.path);
  assert(extractedFolders.length === 1);
  const extractedFolder = extractedFolders[0];
  assert(typeof extractedFolder === "string");
  await renameAsync(joinPath(extractionDir.path, extractedFolder), destination);

  await unlinkAsync(tarball);
  extractionDir.remove();
};

export const getOrDownloadRepository = async function (
  repositoriesDir: string,
  crate: RepositoryCrate,
  logger: Logger,
) {
  const targetRefDir = await ensureDir(joinPath(repositoriesDir, crate.source.ref.tag));

  const repositoryPath = joinPath(targetRefDir, getVersionedRepositoryName(crate));
  if (!(await existsAsync(repositoryPath))) {
    await fetchRepository(repositoriesDir, crate, repositoryPath, logger);
  }

  return repositoryPath;
};
