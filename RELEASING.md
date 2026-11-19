# Releasing client-sdk-js

This repository releases with [verwalter](https://github.com/livekit/verwalter).
The commands that are the same in every repository are in the
[verwalter cheat sheet](https://github.com/livekit/verwalter/blob/main/docs/cheat-sheet.md).
This file holds what is specific to this repository.

## Packages

| Package          | Tag          | Goes to |
| ---------------- | ------------ | ------- |
| `livekit-client` | `v<version>` | npm     |

## Workflows

| File                   | Starts when               | Does                                                                          |
| ---------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| `changeset-check.yaml` | A PR is opened or updated | Fails a PR that changes the package without a changeset.                      |
| `release-pr.yaml`      | A push to `main`          | Keeps the release PR `release/main` current.                                  |
| `release.yaml`         | The release PR merges     | Builds, tags, creates the GitHub release, publishes to npm, uploads the docs. |
| `pre-release.yaml`     | Run by hand               | Opens an rc PR against the branch it runs on.                                 |

Do not rename `release.yaml`: npm trusted publishing names the file.

## Release

1. Merge the release PR.
2. Watch the run of `release.yaml`: `gh run list --workflow release.yaml --limit 1`.

A release is complete when:

- the tag `v<version>` has a public GitHub release
- npm has the version
- the `verify` job is green. It checks the two points above.

The `docs` job uploads the API docs to the docs site. It runs only for a
final version that is released from `main`.

## Pre-release

`gh workflow run pre-release.yaml --ref <branch>` opens an rc PR against
`<branch>`. The merge publishes the rc to npm with the dist-tag `next`.

## Snapshot release

`gh workflow run release.yaml --ref <branch> -f snapshot=true -f snapshot-prefix=<prefix>`
publishes `0.0.0-<prefix>-<timestamp>` to npm with the dist-tag `dev`. A
snapshot has no tag and no GitHub release.

## A release failed

Find the cause first. The paths by cause are in the
[recovery section](https://github.com/livekit/verwalter/blob/main/docs/release-workflows.md#recovery).

| Situation                                                       | Command                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A job failed for a transient reason                             | `gh run rerun <run-id> --failed`                                           |
| The workflow file needed a fix, and the fix is on `main`        | `gh workflow run release.yaml -f ref=<tag>`                                |
| The released commit is wrong, and npm does not have the version | `verwalter release --abandon <tag>`, then a changeset and the next version |

A version that npm has cannot be replaced. Deprecate it with
`npm deprecate`, then release the next version.
