# Notice

license-scanner does not provide legal advice and it is not a lawyer. Licenses
are identified exclusively by automated means, without any step of human
verification, and thus the verdict is subject to bugs in the software and
incomplete heuristics which might yield false positives.

license-scanner aims to provide best-effort automated license scanning.
Regardless of how well it performs, its accuracy should not be relied upon as
the ultimate verdict for legal purposes. You should seek independent legal
advice for any licensing questions that may arise from using this tool.

# TOC

- [Introduction](#introduction)
  - [Supported project metadata](#introduction-supported-project-metadata)
- [Usage](#usage)
  - [Walkthrough](#usage-walkthrough)
  - [`--detection-overrides`](#usage-detection-overrides)
  - [`--start-lines-excludes`](#usage-start-lines-excludes)
- [Implementation](#implementation)

# Introduction <a name="introduction"></a>

license-scanner is a source code license scanner based on file contents (e.g.
LICENSE files, license headers, copyright notices) and
[project metadata](#introduction-supported-project-metadata). The
[Usage section](#usage) provides explanations on what it does and how to use it.

Before starting to work on this project we recommend reading the
[Implementation section](#implementation).

## Supported project metadata <a name="introduction-supported-project-metadata"></a>

Parity intends to primarily use license-scanner for Rust projects, therefore the
following files are supported

- Cargo.toml
- Cargo.lock

Should more files be relevant in future Rust versions, logically they should be
supported as well.

You are welcome to suggest other files, even if they are not Rust-related, which
would make sense for us to support going forward by
[opening a request ticket](https://github.com/paritytech/license-scanner/issues/new).

# Usage <a name="usage"></a>

Requirements:

- [`cargo`](https://doc.rust-lang.org/cargo/)
- [Node.js](https://nodejs.org/en/) LTS
- `npm`
  - Should already be included in your Node.js installation
- [`readelf`](https://man7.org/linux/man-pages/man1/readelf.1.html)
  - Should be available from a package for your operating system

```bash
npm install

# use `scan` for scanning
npm run main -- scan /directory/or/file

# after the scan is complete, optionally dump it to CSV
npm run main -- dump csv /directory/or/file /output.csv
```

If a single file is provided, the scan will be performed exclusively for that
file.

If a directory is provided, it will be scanned recursively. Should
license-scanner find any of the
[supported project metadata](#introduction-supported-project-metadata)
files, it will detect and **download** all of its dependencies. After
downloading a dependency, license-scanner will scan their code
**non-recursively**, i.e. the search will cover the target directory's
dependencies but not dependencies of dependencies.

The scan results are saved to a `db.json` file directly in this repository. You
are able to further tweak those results through
[`--start-lines-excludes`](#usage-start-lines-excludes) and
[`--detection-overrides`](#usage-detection-overrides).

## Walkthrough <a name="usage-walkthrough"></a>

Consider the following directory structure:

```
/directory
├── LICENSE-MIT
├── Cargo.toml
```

After scanning that directory with `npm run main -- scan /directory`, a
`db.json` file will be created in the root of this repository with the following
structure:

```json
{
  "scanResult": {
    "/directory": {
      "LICENSE-MIT": {
        "license": { "id": "MIT" },
      },
      "foo-0.1 file: src/main.rs": {
        "license": { "id": "GPL-3.0-only" },
      }
    }
  }
}
```

- Each scanned directory is registered as an item in `.scanResult` where their
  key is the absolute path (in this case, `/directory`)
- Each file within the directory is registered as an item in
  `.scanResult["/directory"]` where its key (ID) is the path of the file
  relative to the directory
- Each file in a crate (crates are found through `Cargo.toml`) is registered as
  an item in `.scanResult["/directory"]` where its key (ID) is a combination of
  the crate's versioned identifier plus the path of the file relative to the
  crate's directory. In the example above we found a `src/main.rs` file inside
  of a crate named `foo` which has version `0.1`.

IDs (the keys used for each object) are useful in case you want to override the
detection for a given file using
[--detection-overrides](#usage-detection-overrides).

## `--detection-overrides` <a name="usage-detection-overrides"></a>

An example is available in
[example/detection-overrides.json](./example/detection-overrides.json).

This option provides a way of overriding the automatic detection by specifying
Detection Rules as a JSON array from a configuration file. Use it as:

`scan --detection-overrides configuration.json`

Each Detection Rule object should have the following fields:

### `"id"` <a name="usage-detection-overrides-id"></a>

This field defines the ID of the result you wish to override (IDs are formatted
according to the rules explained in the
[Walkthough section](#usage-walkthrough)).

For example, if you want to override the results for the file
`crates/metrics/analyze.rs`:

```json
{
  "id": "crates/metrics/analyze.rs",
  "result": { "license": "Apache-2.0" }
}
```

As another example, if you wish to override the results for:

- Crate: adder
- Crate version: 0.2
- File: src/main.rs

The following rule should be used:

```json
{
  "id": "adder-0.2 file: src/main.rs",
  "result": { "license": "MIT" }
}
```

_This field is exclusive with
[`"starts_with"`](#usage-detection-overrides-starts_with), meaning you should
choose either of them, not both._

### `"starts_with"` <a name="usage-detection-overrides-starts_with"></a>

Instead of
[overriding the detection for a single ID](#usage-detection-overrides-id),
this field defines the **start** of IDs (IDs are formatted according to the
rules explained in the [Walkthough section](#usage-walkthrough)) whose results
should be overridden; that is, any IDs starting with this field's value will be
overridden by the specified `"result"`. This is usually useful for making an
override apply to a whole directory or crate.

For example, if you want to override the results for the whole `docs/`
directory:

```json
{
  "starts_with": "docs/",
  "result": { "license": "CC-BY-1.0" }
}
```

As another example, if you wish to override the results the whole crate
`messenger` whose version is `0.1`:

```json
{
  "starts_with": "messenger-0.1 file:",
  "result": { "license": "MIT" }
}
```

_This field is exclusive with [`"id"`](#usage-detection-overrides-id), meaning
you should choose either of them, not both._

### `"result"`

The result which will be assigned to items matching the expression provided
through [`"id"`](#usage-detection-overrides-id) or
[`"starts_with"`](#usage-detection-overrides-starts_with). The provided value
will replace the automatic detection's result completely for the matched items.
Use `"result": null` to omit the file from the results completely or provide a
[`ScanResultItem`](./license-scanner/types.ts) as a replacement.

### `"compare_with"` (optional)

Provide a reference file whose contents will be compared against the contents of
the file matched to the ID you're overriding. The program will stop the scan if
the content being provided for comparison does not match the content found
during the scan.

This field provides a way of avoiding the problem of a file being changed over
time without your knowledge and thus possibly making the result incorrect.

## `--start-lines-excludes` <a name="usage-start-lines-excludes"></a>

An example is available in
[example/start-lines-excludes.txt](./example/start-lines-excludes.txt).

`--start-lines-excludes` takes as argument a plain-text file which specifies
lines to be excluded from **the top** of the file during the text normalization
step. This is mainly useful for removing "Copyright (c) Foo Bar" boilerplate
at the start of licenses which would normally make the detector misrecognize
them. For instance, if you see lots of licenses starting with the following
template:

```
Copyright (c) Foo Bar, 2019
All right reserved.

[actual license here]
```

It will be helpful to provide a file through `--start-lines-excludes` with the
following contents:

```
Copyright (c) Foo Bar, 2019
All right reserved.
```

Doing so will remove the specified boilerplate lines from **the top** of the
licenses so that the detector will be able get to the actual license's text
cleanly.

# Implementation <a name="implementation"></a>

[`scan`](https://github.com/paritytech/license-scanner/blob/668b8c5f1cfa1dfc8f22170562f648a344cb60ef/license-scanner/scanner.ts#L141)
is the entrypoint for this project. Instead of being coupled to
[`main`](https://github.com/paritytech/license-scanner/blob/668b8c5f1cfa1dfc8f22170562f648a344cb60ef/license-scanner/main.ts#L10),
all the scan-related code is purposefully designed as a library so that it can
be used easily on other projects ([we plan to use license-scanner for the CLA bot](https://gitlab.parity.io/parity/opstooling/cla-bot-2021/-/issues/79)).

As documented in the [Usage section](#usage), license-scanner also
[scans crates](https://github.com/paritytech/license-scanner/blob/d4505ede5d334b3ca67c353c880292338ad4e3a2/license-scanner/scanner.ts#L20)
and that is where
[rust-crate-scanner](https://github.com/paritytech/license-scanner/tree/668b8c5f1cfa1dfc8f22170562f648a344cb60ef/rust-crate-scanner)
comes into play (we use it to
[detect crates from lockfiles](https://github.com/paritytech/license-scanner/blob/668b8c5f1cfa1dfc8f22170562f648a344cb60ef/rust-crate-scanner/main.rs#L41)).
Note that you do not need to manually compile rust-crate-scanner before running
the CLI because
[`cargo run`](https://github.com/paritytech/license-scanner/blob/668b8c5f1cfa1dfc8f22170562f648a344cb60ef/license-scanner/scanner.ts#L41)
already will automatically (re)compile the project if necessary.
