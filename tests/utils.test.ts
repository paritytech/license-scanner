import { expect } from "chai";
import { isBinaryFile } from "license-scanner/utils";
import path from "path";

describe("Utils", () => {
  it("isBinaryFile", async () => {
    const binaryFilePath = path.join(process.cwd(), "./tests/elf-binary-file");
    const nonBinaryFilePath = path.join(process.cwd(), "package.json");

    expect(await isBinaryFile(binaryFilePath)).to.be.true;
    expect(await isBinaryFile(nonBinaryFilePath)).to.be.false;
  });
});
