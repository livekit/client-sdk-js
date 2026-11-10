# Contributing

Thank you for your interest in this project. These rules apply to contributors who are not members of the LiveKit GitHub organization. Members of the organization can open pull requests directly.

## Before you open a pull request

A pull request (PR) must link to an issue that has the `accepted` label.

1. Search the existing issues. If no issue describes your change, open one.
2. Describe the problem and the change that you propose.
3. Wait for a maintainer to add the `accepted` label. Only maintainers add this label.
4. After the issue has the label, open the PR. Link the issue in the description, for example `Fixes #123`.

Before the issue is accepted, do not start work. An accepted issue tells you that the maintainers want the change and agree with the approach.

### Exemptions

These PRs do not need an accepted issue:

- Typo fixes and documentation fixes with 20 changed lines or fewer. Check the related box in the PR template.
- Dependency version bumps that do not change code.

### PRs without an accepted issue

A bot closes the PR with a link to this document. After the issue has the `accepted` label, edit the PR description and link the issue. The bot then opens the PR again.

## Rules for every pull request

- **One issue per PR.** A PR solves one accepted issue. Do not include unrelated refactors or formatting changes.
- **Sign the CLA.** The CLA bot comments on your first PR with a link. Before you sign the CLA, maintainers do not review the PR.
- **Disclose AI assistance.** State in the PR description each AI tool that wrote or helped write the change. You must understand the code, and you must test it yourself. Maintainers close PRs that the author cannot explain.
- **Write the PR description yourself.** We strongly encourage a description in your own words, not text from an AI tool. A short description from you helps more than a long generated one. It shows the maintainers what you understand about the change.

## Security issues

Do not open a public issue for a security vulnerability. Send a report to security@livekit.io.
