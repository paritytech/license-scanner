import { isBinaryFile } from "#license-scanner/utils";
import { expect } from "earl";
import { describe, it } from "node:test";
import path from "path";

await describe("Utils", async () => {
  await it("isBinaryFile", async () => {
    const binaryFilePath = path.join(process.cwd(), "./tests/elf-binary-file");
    const nonBinaryFilePath = path.join(process.cwd(), "package.json");

    expect(await isBinaryFile(binaryFilePath)).toEqual(true);
    expect(await isBinaryFile(nonBinaryFilePath)).toEqual(false);
  });
});
