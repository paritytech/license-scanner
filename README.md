# license-scanner

This project implements a repository-wide recursive license scanner based on
file contents and project metadata.

Aside from simple plain-text file scanning, it supports
[cargo](https://doc.rust-lang.org/cargo/) metadata (Cargo.toml and Cargo.lock).
In the future it could also support more languages and metadata files e.g.
`package.json` for Node.

# Notice

This tool does not provide legal advice and it is not a lawyer. Licenses are
identified exclusively by automated means, without any step of human
verification, and thus the verdict is subject to bugs in the software and
incomplete heuristics which might yield false positives.

This tool serves the purpose of providing best-effort automated scanning
recursively through a repository. Regardless of how well it performs, the
accuracy of this tool should not be relied upon as the ultimate verdict for
legal purposes. You should seek independent legal advice for any licensing
questions that may arise from using this tool.

# Running

Requirements:

- Rust (and `cargo`)
- Node.js LTS (and `npm`)
- `readelf`

```bash
npm install

# use the following for scanning
npm run main -- scan /target/directory/or/file

# after the scan is complete, optionally dump it to CSV
npm run main -- dump csv /target/directory/or/file /output.csv
```

If a single file is given as argument, the main command will scan that file and
print the result.

If a directory is provided, it will be scanned recursively. Should
license-scanner find any of the [supported project metadata](#license-scanner)
files, it will parse its dependencies and **download** their code the registry
or Github.  After downloading a dependency, it will scan their code
**non-recursively**, i.e. the search will cover the target directories'
dependencies but not dependencies of dependencies.

The scan results are saved to `db.json` as demonstrated by the following
section. You are able to further customize the output through
[--start-lines-excludes](#start-lines-excludes) and
[--detection-overrides](#detection-overrides).

## Walkthrough

Suppose the following directory structure:

```
/target
├── LICENSE-MIT
├── Cargo.toml
```

After scanning that directory with `npm run main -- scan /target`, a `db.json`
file will be created in the root of this repository as follows (metadata
omitted for brevity's sake):

```json
{
  "scanResult": {
    "/target/directory": {
      "LICENSE-MIT": {
        "license": { "id": "MIT" },
      },
      "foo-0.1 file: main.rs": {
        "license": { "id": "GPL-3.0-only" },
      }
    }
  }
}
```

- Each directory constitutes a collection under `"scanResult"` keyed by their
  absolute path (in this case, `/target/directory`)
- Each file within the directory constitutes a new item under
  `/target/directory` keyed by their relative path to the directory
- Each crate resolved through the root `Cargo.toml` constitutes a new item
  under `/target/directory` keyed by their versioned identifier plus relative
  path **relative to the crate**. In the example above we found a `main.rs`
  file inside of a crate named `foo` which has version `0.1`.

We'll refer to the individual identifier (for instance, `foo-0.1 file: main.rs`
is a key) for a given result as the "ID" from this point onwards.

## --detection-overrides <a name="detection-overrides"></a>

[See an example for the configuration](./example/detection-overrides.json)

A file provided through this command will be parsed as a JSON array with rules
for overriding the detection of some specific file or directory. If the
automatic detection is not working as you'd expect, this is specifying for
specifying the results manually, which effectively means the unit of work for
the files matched by the rule will be skipped by the scan and your result will
be used instead.

Each object in the JSON array should have the following attributes:

### id

The ID of the result you wish to override; IDs are formatted with according to
the rules explained in the [Walkthough section](#walkthrough).  For instance,
if you want to override the results for "src/main.rs", in the crate "adder",
which has version 0.2, you'd use the following rule:

```
{
  "id": "adder-0.2 file: src/main.rs",
  "result": { "license": "MIT" }
}
```

_This attribute is exclusive with `starts_with`, meaning you should provide
either, but not both._

### starts_with

- `starts_with`: Instead of overriding a single ID, override all IDs starting
  with the given string; this is usually useful for making an override apply to
  a whole directory or crate instead of a single file. For instance, if you
  want to override all files in the `src/` directory crate "subscriber", which
  has version 0.2, you'd use the following rule:

```
{
  "starts_with": "subscriber-0.2 file: src/",
  "result": { "license": "MIT" }
}
```

_This attribute is exclusive with `id`, meaning you should provide either, but
not both._

### result

The result you'll assign to items matching the expression provided through `id`
or `starts_with`. The provided result will strictly override the built-in
detection, meaning the file will not be scanned and your result will be saved
exactly as-is. The provided value is either an object of your choice (for
consistency sake with the non-overridden results, you'll want follow the format
of
[ScanResultItem](https://github.com/joao-paulo-parity/license-scanner/blob/master/license-scanner/types.ts)
or `null` to omit the file from the results completely.

### compare_with (optional)

Provide a reference file which will be compared against the contents of the
file mapped to the ID you're overriding. The scanner will throw an error if the
file being provided for comparison does not match the file mapped to the same
ID found during the scan. This is useful so that you're assured the result
being set corresponds to a file with the same contents in the target; it avoids
the problem of a file being changed over time without your knowledge and thus
possibly making the result incorrect.

## --start-lines-excludes <a name="start-lines-excludes"></a>

[See an example for the configuration](./example/start-lines-excludes.txt)

The argument is a plain-text file which specifies lines to be excluded from
**the top** of the file during the text normalization step. This is mainly
useful for removing "Copyright (c) Foo Bar" kinds of lines of top of licenses
which would normally make the detector misrecognize the licenses. For instance,
if you see lots of licenses starting with the following convention:

```
Copyright (c) Foo Bar, 2019
All right reserved.

[actual license here]
```

It might be useful to provide a file to `--start-lines-excludes` with with the
following contents:

```
Copyright (c) Foo Bar, 2019
All right reserved.
```

That would effectively trim the boilerplate out of **the top** of the files so
that the detector will be able to process the actual license's text cleanly.
