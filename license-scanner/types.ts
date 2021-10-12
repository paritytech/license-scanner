import type { Logger } from "./logger"

type ScanResultItemMetadata = Record<string, unknown>
export type ScanResultItem =
  | { description: string; meta?: ScanResultItemMetadata }
  | { license: string; meta?: ScanResultItemMetadata }

type DetectionOverrideInputBase = {
  compare_with?: string
  result: ScanResultItem | null
}
export type DetectionOverrideInput =
  | (DetectionOverrideInputBase & { id: string })
  | (DetectionOverrideInputBase & { starts_with: string })

export class DetectionOverride {
  constructor(
    public result: ScanResultItem | null,
    public contents: string | null,
    public value: string,
  ) {}
}
export class DetectionOverrideByStartsWith extends DetectionOverride {}
export class DetectionOverrideById extends DetectionOverride {}

export type ScanOptionsRust = {
  cargoExecPath: string
  rustCrateScannerRoot: string
  shouldCheckForCargoLock: boolean
}

export class ScanTracker {
  fileHistory: Map<string, string>
  constructor() {
    this.fileHistory = new Map()
  }

  public setFileKey(file: string, key: string) {
    const prevFileWithTheSameKey = this.fileHistory.get(key)
    if (prevFileWithTheSameKey) {
      throw new Error(
        `Generated key ${key} for both for ${file} and ${prevFileWithTheSameKey}; all keys should be unique`,
      )
    } else {
      this.fileHistory.set(key, file)
    }
  }
}

export type ScanOptions = {
  saveResult: (
    projectId: string,
    filePathFromRoot: string,
    result: ScanResultItem,
  ) => Promise<void>
  root: string
  initialRoot: string
  dirs: {
    repositories: string
    crates: string
  }
  matchLicense: (file: string) => Promise<ScanResultItem | undefined>
  rust: ScanOptionsRust | null
  transformItemKey?: (str: string) => string
  tracker: ScanTracker
  detectionOverrides: DetectionOverride[] | null
  meta?: ScanResultItemMetadata
  logger: Logger
}

export type LicenseInput = {
  id: string
  text: string[]
  match: "fragment" | "full"
  result?: ScanResultItem | null
}

export type License = Omit<LicenseInput, "text"> & {
  uid: number
  text: string
  needleStart: string
}

export class DatabaseSaveError extends Error {
  constructor(public item: unknown) {
    super("Failed to save item to the database")
  }
}

export class DB {
  constructor(public path: string) {}
}

export type RustCrateScannerOutput = {
  license: string | null | undefined
  crates: Crate[] | null | undefined
}

type CrateBase = { name: string; version: string }

export class RepositoryCrate {
  constructor(
    public base: CrateBase,
    public source: {
      tag: "git"
      repository: string
      ref: { tag: "tag" | "ref" | "rev"; value: string }
    },
  ) {}
}
export class CratesIoCrate {
  constructor(public base: CrateBase, public source: { tag: "crates.io" }) {}
}

export type Crate = CrateBase & {
  source:
    | null
    | RepositoryCrate["source"]
    | CratesIoCrate["source"]
    | { tag: "unexpected"; value: unknown }
}

export class UnexpectedCrateSourceError extends Error {
  constructor(public item: unknown) {
    super("Got unexpected crate source type")
  }
}

export type CargoMetadataOutputV1 = {
  packages: { name: string; version: string; manifest_path: string }[]
}
