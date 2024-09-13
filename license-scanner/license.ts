import assert from "assert";
import fs from "fs";
import { promisify } from "util";

import { EnsureLicensesInResultOptions, License, LicenseInput } from "./types";
import { isBinaryFile, loadFiles } from "./utils";

const openAsync = promisify(fs.open);
const readAsync = promisify(fs.read);

const normalizeLicense = function (text: string, startLinesExcludes: string[] = []) {
  // https://dictionary.cambridge.org/grammar/british-grammar/punctuation
  text = text.replace(/\r/g, "\n").replace(/^[^a-zA-Z0-9"'(\-,:;.!)]+/, "");

  toNextExclude: while (true) {
    for (const exclude of startLinesExcludes) {
      if (text.startsWith(exclude + "\n")) {
        text = text.replace(exclude, "").trimStart();
        continue toNextExclude;
      }
    }
    break;
  }

  return text
    .replace(/^[^a-zA-Z0-9"'(\-,:;.!)]+/gm, "")
    .replace(/[^a-zA-Z0-9"'(\-,:;.!)]+$/gm, "")
    .replace(/\s+/g, " ")
    .trimEnd();
};

export const loadLicensesNormalized = async function (
  root: string,
  options?: { aliases: Map<string, string>; extraLicenses?: LicenseInput[] },
): Promise<License[]> {
  const loadedLicenses: LicenseInput[] = Object.entries(await loadFiles(root))
    .map(([id, text]) => [{ id, text: [text], match: "full" as const }])
    .flat()
    .concat();

  let uidCounter = 0;
  return loadedLicenses
    .concat(options?.extraLicenses ?? [])
    .map(({ text: rawTexts, id: originalId, ...partialLicense }) => {
      const id = options?.aliases.get(originalId) ?? originalId;
      return rawTexts.map((rawText) => {
        const uid = ++uidCounter;
        const text = normalizeLicense(rawText);

        const matches = text.match(/^(\S+\s*)/);
        assert(matches);
        const [_, needleStart] = matches;
        assert(needleStart);

        return { ...partialLicense, id, uid, text, needleStart };
      });
    })
    .flat();
};

const tailRegexpGenerator = function (word: string, flags?: string) {
  const exps = [];
  const max = word.length + 1;
  for (let i = 1; i < max; ++i) {
    exps.push(new RegExp(`${word.substring(0, i)}$`, flags));
  }
  return exps;
};

const copyrightTailRegExp = tailRegexpGenerator("copyright", "i");

const spdxLicenseIdentifierCaption = "SPDX-License-Identifier";
const spdxLicenseIdentifierTailRegExp = tailRegexpGenerator(spdxLicenseIdentifierCaption).concat(
  new RegExp(`${spdxLicenseIdentifierCaption}[^a-zA-Z0-9]+$`),
);

const spdxLicenseIdentifierPrefix = `${spdxLicenseIdentifierCaption}[^a-zA-Z0-9]+`;
const spdxLicenseIdentifierMatcher = new RegExp(`${spdxLicenseIdentifierPrefix}[^a-zA-Z0-9]+([^\n]+)\n`);

const triggerAccumulationRegExp = copyrightTailRegExp.concat(spdxLicenseIdentifierTailRegExp);

export const getLicenseMatcher = function (licenses: License[], startLinesExcludes?: string[]) {
  const bufSize = Math.max(
    4096,
    ...licenses.map(({ text, match }) => {
      switch (match) {
        case "fragment": {
          /* Buffer size needs to be at least as bit as the largest fragment so
             that we can compare against the full slice in a single pass */
          return text.length;
        }
        default: {
          return 0;
        }
      }
    }),
  );

  return async function (file: string) {
    if (await isBinaryFile(file)) {
      return;
    }

    const fragmentMatchesSoFar: Map<number, string[]> = new Map();
    const fullMatchesSoFar: Map<number, number | null> = new Map();
    let isCopyrighted = false;

    /* Because matches are computed per-chunk, the heuristics might fail for
       subsequent passes if the chunk was merged with the accumulated buffer
       from a previous pass; we'll workaround that by only committing to the
       state only if this is a new chunk which has not been accumulated */
    let pendingCallbacksIfChunkNotAccumulated: (() => void)[] = [];

    const fd = await openAsync(file, "r");
    const buf = Buffer.alloc(bufSize);
    let offset = 0;
    let bytesRead = 0;
    let accumulator = "";

    readBytes: while ((bytesRead = (await readAsync(fd, buf, 0, bufSize, offset)).bytesRead)) {
      offset += bytesRead;

      let chunk = buf.slice(0, bytesRead).toString();
      for (const tailRegExp of triggerAccumulationRegExp) {
        if (tailRegExp.test(chunk)) {
          accumulator = `${accumulator}${chunk}`;
          continue readBytes;
        }
      }

      chunk = `${accumulator}${chunk}`;
      accumulator = "";

      if (!isCopyrighted && chunk.match(/copyright/i)) {
        isCopyrighted = true;
      }

      if (spdxLicenseIdentifierMatcher.test(chunk)) {
        const match = spdxLicenseIdentifierMatcher.exec(chunk);
        if (match === null) {
          accumulator = chunk;
          continue readBytes;
        } else {
          const [_, spdxId] = match;
          return { license: spdxId };
        }
      }

      const normalizedChunk = normalizeLicense(chunk, startLinesExcludes);

      /* This is used in case we've read some data but the text we're trying to
         match might be incomplete (the remaining could be found in the next
         chunk) */
      let shouldAccumulateChunk = false;

      for (const license of licenses) {
        switch (license.match) {
          case "full": {
            const savedStart = fullMatchesSoFar.get(license.uid);
            if (savedStart === null) {
              continue;
            }

            const prevStart = savedStart ?? 0;
            const length = Math.min(prevStart + normalizedChunk.length, license.text.length);
            if (
              license.text.substring(prevStart, length).startsWith(normalizedChunk.substring(0, length - prevStart))
            ) {
              if (length === license.text.length) {
                return { license: license.id };
              } else {
                pendingCallbacksIfChunkNotAccumulated.push(() => {
                  fullMatchesSoFar.set(license.uid, length);
                });
              }
            } else {
              fullMatchesSoFar.set(license.uid, null);
            }

            break;
          }
          case "fragment": {
            const nextMatches: string[] = [];
            let matchesFound = false;

            for (const pastMatch of fragmentMatchesSoFar.get(license.uid) ?? []) {
              for (const start of [`${pastMatch} ${normalizedChunk}`, `${pastMatch}${normalizedChunk}`]) {
                if (
                  license.text.startsWith(
                    start.substring(0, Math.min(license.text.length - start.length, start.length)),
                  )
                ) {
                  if (license.text === start) {
                    return { license: license.id };
                  } else {
                    matchesFound = true;
                    pendingCallbacksIfChunkNotAccumulated.push(() => {
                      nextMatches.push(start);
                    });
                    break;
                  }
                }
              }
            }

            let startOffset = normalizedChunk.indexOf(license.needleStart);
            if (startOffset !== -1) {
              while (true) {
                const slice = normalizedChunk.substr(startOffset, license.text.length);
                if (license.text === slice) {
                  return { license: license.id };
                } else if (license.text.startsWith(slice)) {
                  matchesFound = true;
                  pendingCallbacksIfChunkNotAccumulated.push(() => {
                    nextMatches.push(slice);
                  });
                  break;
                } else {
                  const nextOffset = normalizedChunk
                    .substring(startOffset + license.needleStart.length)
                    .indexOf(license.needleStart);
                  if (nextOffset === -1) {
                    break;
                  } else {
                    startOffset += nextOffset + license.needleStart.length;
                  }
                }
              }
            }

            if (matchesFound) {
              pendingCallbacksIfChunkNotAccumulated.push(() => {
                fragmentMatchesSoFar.set(license.uid, nextMatches);
              });
            } else {
              fragmentMatchesSoFar.delete(license.uid);

              if (!shouldAccumulateChunk) {
                /* The chunk we've read might have the start of the license text
                   at the end and then the remaining of the license could be
                   found on the next chunk, so it's useful for us to set
                   "shouldAccumulateChunk = true" if that is the case */
                for (let i = 0; i < license.needleStart.length; ++i) {
                  if (normalizedChunk.endsWith(license.needleStart.substring(0, i))) {
                    shouldAccumulateChunk = true;
                    break;
                  }
                }
              }
            }
            break;
          }
          default: {
            break;
          }
        }
      }

      if (shouldAccumulateChunk) {
        accumulator = chunk;
      } else {
        for (const callback of pendingCallbacksIfChunkNotAccumulated) {
          callback();
        }
        pendingCallbacksIfChunkNotAccumulated = [];
      }
    }

    if (isCopyrighted) {
      return {
        description: 'Flagged because "copyright" was found somewhere within this file, but no licenses were detected',
      };
    }
  };
};

export const ensureLicensesInResult = function ({
  file,
  result,
  ensureLicenses,
}: EnsureLicensesInResultOptions): Error | undefined {
  if (ensureLicenses === false) return;
  if (result === undefined) {
    return new Error(`No license detected in ${file.name}. Exact file path: "${file.path}"`);
  }

  if ("description" in result) {
    return new Error(`${file.name} resulted in: ${result.description}. Exact file path: "${file.path}"`);
  }

  /* At this point, the file has some license detected.
     If specific licenses are required, check that the detected is one of them */
  if (typeof ensureLicenses !== "object") return;
  if (!ensureLicenses.includes(result.license)) {
    return new Error(
      `${file.name} has ${result.license} license` +
        `, expected one of: ${ensureLicenses.join(",")}. Exact file path: "${file.path}"`,
    );
  }
};

/**
 * If a product is mentioned in this file,
 * ensure that it is the correct product,
 * and not a copy-paste error from a different product.
 */
export const ensureProductInFile = function (filePath: string, product: string | undefined): Error | undefined {
  if (!product) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const regexp of [
    new RegExp("This file is part of (.*)\\."),
    new RegExp("// (.*) is free software"),
    new RegExp("// (.*) is distributed in the hope"),
    new RegExp("// along with (.+?)\\.(.*)gnu.org"),
  ]) {
    for (const line of lines) {
      if (regexp.test(line)) {
        const matches = regexp.exec(line);
        assert(matches);
        if (matches[1] !== product && matches[1].toLowerCase() !== "this program") {
          return new Error(
            `Product mismatch in ${filePath}. Expected "${product}", detected "${matches[1]}" in line: "${line}".`,
          );
        }
      }
    }
  }
};

export const throwLicensingErrors = function (licensingErrors: Error[]) {
  if (licensingErrors.length === 0) return;
  throw new Error(
    "Encountered the following errors when enforcing licenses:\n" +
      licensingErrors.map((error) => error.message).join("\n"),
  );
};
