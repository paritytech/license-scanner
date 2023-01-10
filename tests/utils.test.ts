import { expect } from "chai";
import { isBinaryFile } from "license-scanner/utils";
import path from "path";

describe("Utils", () => {
  it("isBinaryFile", async () => {
    const binaryFilePath = path.join(__dirname, "./elf-binary-file");
    const nonBinaryFilePath = path.join(__dirname, "./utils.test.ts");

    expect(await isBinaryFile(binaryFilePath)).to.be.true;
    expect(await isBinaryFile(nonBinaryFilePath)).to.be.false;
  });
});
