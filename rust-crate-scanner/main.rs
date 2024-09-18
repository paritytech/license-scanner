use cargo_lock::package::source::GitReference;
use serde::{Deserialize, Serialize};
use serde_json::{self, json};
use std::{env, fs, path::Path, process};
use cargo_toml::Inheritable;

#[derive(Serialize, Deserialize)]
struct ScanResult {
  license: Option<String>,
  crates: Option<Vec<serde_json::Value>>,
}

fn scan(
  project: &String,
  should_check_for_cargo_lock: bool,
) -> Result<ScanResult, String> {
  let license = {
    let cargo_toml_path = Path::new(&project).join("Cargo.toml");
    let contents = fs::read_to_string(&cargo_toml_path).map_err(|err| {
      format!("Failed to read {:?}: {:?}", &cargo_toml_path, err)
    })?;
    let manifest: cargo_toml::Manifest =
      toml::from_str(&contents).map_err(|err| {
        format!("Failed to parse {:?}: {:?}", &cargo_toml_path, err)
      })?;
    let package_license = manifest.package.map(|pkg| pkg.license).flatten();
    let workspace_license = manifest.workspace.clone().map(|ws| ws.package.map(|pkg| pkg.license).flatten()).flatten();

    match package_license {
      Some(license) => match license {
        Inheritable::Set(license) => Some(license),
        Inheritable::Inherited { .. } => None
      },
      None => None
    }
  };

  let crates = if should_check_for_cargo_lock {
    let cargo_lock_path = Path::new(&project).join("Cargo.lock");

    let lockfile =
      cargo_lock::Lockfile::load(&cargo_lock_path).map_err(|err| {
        format!(
          "Failed to parse lockfile of {:?}: {:?}",
          cargo_lock_path, err
        )
      })?;

    Some(
      lockfile
        .packages
        .iter()
        .map(|pkg| {
          let source = pkg.source.as_ref().map(|source| {
            if source.is_git() {
              match source.git_reference() {
                Some(git_ref) => {
                  let git_ref = match git_ref {
                    GitReference::Tag(tag) => json!({ "tag": "tag", "value": tag }),
                    GitReference::Branch(branch) => {
                      let value = source.precise().unwrap_or(branch);
                      json!({ "tag": "ref", "value": value })
                    }
                    GitReference::Rev(rev) => json!({ "tag": "rev", "value": rev }),
                  };
                  json!({ "tag": "git", "repository": source.url().to_string(), "ref": git_ref })
                },
                None => json!({ "tag": "unexpected", "value": source })
              }
            } else if source.is_default_registry() {
              json!({ "tag": "crates.io" })
            } else {
              json!({ "tag": "unexpected", "value": source })
            }
          });

          json!({ "name": pkg.name, "version": pkg.version, "source": source })
        })
        .collect(),
    )
  } else {
    None
  };

  Ok(ScanResult { license, crates })
}

fn main() {
  let mut args = env::args();
  let _ = args
    .next()
    .expect("Expected to have the first argument: the program's path");

  let project = args
    .next()
    .expect("Missing the first argument: the project's root");

  let should_check_for_cargo_lock = {
    let raw = args
      .next()
      .expect("Missing the second argument: should_check_for_cargo_lock");
    match raw.as_str() {
      "true" => true,
      "false" => false,
      _ => {
        eprintln!("should_check_for_cargo_lock argument should either be \"true\" or \"false\"");
        process::exit(1);
      }
    }
  };

  match scan(&project, should_check_for_cargo_lock) {
    Ok(result) => println!("{}", json!(result)),
    Err(err) => {
      eprintln!("{}", err);
      process::exit(1);
    }
  };
}
