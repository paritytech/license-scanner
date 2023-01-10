import { expect } from "chai";
import { isBinaryFile } from "license-scanner/utils";
import path from "path";
import { fileURLToPath } from "url";

describe("Utils", () => {
  it("isBinaryFile", async () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const binaryFilePath = path.join(dir, "./elf-binary-file");
    const nonBinaryFilePath = path.join(dir, "./utils.test.ts");

    expect(await isBinaryFile(binaryFilePath)).to.be.true;
    expect(await isBinaryFile(nonBinaryFilePath)).to.be.false;
  });
});
