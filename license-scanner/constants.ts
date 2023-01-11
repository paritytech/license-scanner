import { join as joinPath } from "path";

import { LicenseInput } from "./types";

export const projectRoot = process.cwd();

export const dataDir = joinPath(projectRoot, "data");

export const databasePath = joinPath(projectRoot, "db.json");

export const cratesDir = joinPath(dataDir, "crates");

export const repositoriesDir = joinPath(dataDir, "repositories");

export const rustCrateScannerRoot = joinPath(projectRoot, "rust-crate-scanner");

export const extraLicenses: LicenseInput[] = [
  {
    id: "GPL-3.0-only",
    text: [
      `
      you can redistribute it and/or modify it under the terms of the GNU General
      Public License as published by the Free Software Foundation, either version 3
      of the License, or (at your option) any later version.
      `,
    ],
    match: "fragment",
  },
  { id: "Apache-2.0", text: ["Licensed under the Apache License, Version 2.0"], match: "fragment" },
  { id: "MIT", text: ["Licensed under the MIT License", "Licensed under the MIT license"], match: "fragment" },
  {
    id: "MPL-2.0",
    text: ["This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0"],
    match: "fragment",
  },
  {
    id: "BSD-?",
    text: [
      "This source code is licensed under both the BSD-style license",
      "Use of this source code is governed by a BSD-style license",
    ],
    match: "fragment",
  },
  {
    id: "LICENSE",
    text: [
      "See LICENSE for licensing details.",
      "See LICENSE for licensing information.",
      "See LICENSE-APACHE, and LICENSE-MIT for details.",
      "See LICENSE-MIT for details.",
      "See LICENSE-THIRD-PARTY for details.",
      "See LICENSE-APACHE.txt, and LICENSE-MIT.txt for details.",
    ],
    match: "fragment",
    result: { description: "Defined in LICENSE for this project" },
  },
];

export const licenseAliases: Map<string, string> = new Map([
  ["BSD-3-CLAUSE-with-asterisks", "BSD-3-CLAUSE"],
  ["Apache-2.0-without-appendix", "Apache-2.0"],
]);
