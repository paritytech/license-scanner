import type { Logger, LogLevel } from "./logger";

export type DatabaseLayout = {
  scanResult?: {
    [path: string]: {
      [id: string]: ScanResultItem;
    };
  };
};

type ScanResultItemMetadata = Record<string, unknown>;
export type ScanResultItem =
  | { description: string; meta?: ScanResultItemMetadata }
  | { license: string; meta?: ScanResultItemMetadata };

type DetectionOverrideInputBase = {
  compare_with?: string;
  result: ScanResultItem | null;
};
export type DetectionOverrideInput =
  | (DetectionOverrideInputBase & { id: string })
  | (DetectionOverrideInputBase & { starts_with: string });

export class DetectionOverride {
  constructor(public result: ScanResultItem | null, public contents: string | null, public value: string) {}
}
export class DetectionOverrideByStartsWith extends DetectionOverride {}
export class DetectionOverrideById extends DetectionOverride {}

export type ScanOptionsRust = {
  cargoExecPath: string;
  rustCrateScannerRoot: string;
  shouldCheckForCargoLock: boolean;
};

export class ScanTracker {
  fileHistory: Map<string, string>;
  constructor() {
    this.fileHistory = new Map();
  }

  public setFileKey(file: string, key: string) {
    const prevFileWithTheSameKey = this.fileHistory.get(key);
    if (prevFileWithTheSameKey) {
      throw new Error(
        `Generated key ${key} for both for ${file} and ${prevFileWithTheSameKey}; all keys should be unique`,
      );
    } else {
      this.fileHistory.set(key, file);
    }
  }
}

export type ScanResult = {
  licensingErrors: Error[];
};

export type LicenceMatcher = (file: string) => Promise<ScanResultItem | undefined>;

export type ScanOptions = {
  saveResult: (projectId: string, filePathFromRoot: string, result: ScanResultItem) => Promise<void>;
  root: string;
  initialRoot: string;
  exclude: string[];
  dirs: {
    repositories: string;
    crates: string;
  };
  matchLicense: LicenceMatcher;
  rust: ScanOptionsRust | null;
  transformItemKey?: (str: string) => string;
  tracker: ScanTracker;
  detectionOverrides: DetectionOverride[];
  meta?: ScanResultItemMetadata;
  logger: Logger;
  /**
   * If true, the scan will make sure that all source files have some license detected.
   * If set to a specific license(s), the scan will make sure that
   * all source files have one of those licenses detected.
   */
  ensureLicenses?: boolean | string[];
  /**
   * If true, the scan will make sure that
   * the license headers contain the correct product name.
   */
  ensureProduct?: string | undefined;
};

export type LicenseInput = {
  id: string;
  text: string[];
  match: "fragment" | "full";
  result?: ScanResultItem | null;
};

export type License = Omit<LicenseInput, "text"> & {
  uid: number;
  text: string;
  needleStart: string;
};

export type EnsureLicensesInResultOptions = {
  file: { path: string; name: string };
  result: ScanResultItem | undefined;
  ensureLicenses: boolean | string[];
};

export class DatabaseSaveError extends Error {
  constructor(public item: unknown) {
    super("Failed to save item to the database");
  }
}

export class DB {
  constructor(public path: string) {}
}

export type RustCrateScannerOutput = {
  license: string | null | undefined;
  crates: Crate[] | null | undefined;
};

type CrateBase = { name: string; version: string };

export class RepositoryCrate {
  constructor(
    public base: CrateBase,
    public source: {
      tag: "git";
      repository: string;
      ref: { tag: "tag" | "ref" | "rev"; value: string };
    },
  ) {}
}
export class CratesIoCrate {
  constructor(public base: CrateBase, public source: { tag: "crates.io" }) {}
}

export type Crate = CrateBase & {
  source: null | RepositoryCrate["source"] | CratesIoCrate["source"] | { tag: "unexpected"; value: unknown };
};

export class UnexpectedCrateSourceError extends Error {
  constructor(public item: unknown) {
    super("Got unexpected crate source type");
  }
}

export type CargoMetadataOutputV1 = {
  packages: { name: string; version: string; manifest_path: string }[];
};

export interface ScanCliArgs {
  scanRoots: string[];
  exclude: string[];
  startLinesExcludes: string[];
  detectionOverrides: DetectionOverride[];
  logLevel: LogLevel;
  ensureLicenses: boolean | string[];
  ensureProduct: string | undefined;
}

export interface DumpCliArgs {
  scanRoot: string;
  outputFile: string;
}
