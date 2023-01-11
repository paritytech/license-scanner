import { expect } from "chai";
import { projectRoot } from "license-scanner/constants";
import { isBinaryFile } from "license-scanner/utils";
import path from "path";

describe("Utils", () => {
  it("isBinaryFile", async () => {
    const binaryFilePath = path.join(projectRoot, "./tests/elf-binary-file");
    const nonBinaryFilePath = path.join(projectRoot, "package.json");

    expect(await isBinaryFile(binaryFilePath)).to.be.true;
    expect(await isBinaryFile(nonBinaryFilePath)).to.be.false;
  });
});
