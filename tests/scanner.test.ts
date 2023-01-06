import { executeScanArgs } from "license-scanner/cli/scan";
import path from "path";
import { fileURLToPath } from "url";

describe("Scanner tests", () => {
  let targetsRoot: string;
  before(() => {
    targetsRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "./targets");
  });

  it("single-crate", async () => {
    const scanRoot = path.join(targetsRoot, "single-crate");
    await executeScanArgs({
      args: { scanRoot, startLinesExcludes: null, detectionOverrides: null, logLevel: "debug" },
    });
  });
});
