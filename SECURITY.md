# Security Policy

## Supported versions

Chromuta is a single-track project. Security fixes go into the latest release, and there
are no maintained older branches.

| Version        | Supported |
| -------------- | --------- |
| Latest release | Yes       |
| Anything older | No        |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it through GitHub's private vulnerability reporting:

<https://github.com/henzyd/chromuta/security/advisories/new>

That channel is visible only to the maintainers. You will get an acknowledgement within
seven days, and an assessment with a fix or a rejection within thirty.

Useful things to include:

- What an attacker can do, and what they need to already have in order to do it
- The affected version, and your VS Code version and platform
- A minimal reproduction, ideally a file that triggers it

## What is in scope

Chromuta reads files in the open workspace and writes edits back to them. The
interesting attack surface is therefore workspace content that the extension parses:

- A crafted file causing an edit outside the intended range, or corrupting content it
  should not have touched
- A crafted file causing unbounded CPU or memory use, for instance through catastrophic
  regex backtracking in the detection patterns
- A crafted `chromuta.mapping.json` causing a write outside the workspace
- Anything causing code execution from workspace content

Chromuta makes no network requests, runs no subprocesses, and reads no credentials. If
you find it doing any of those, that is a finding in itself.

## What is out of scope

- Findings that require the user to have already been persuaded to run untrusted code
- Vulnerabilities in VS Code itself, which belong to
  [Microsoft](https://github.com/microsoft/vscode/security/policy)
- Dependency advisories with no reachable path from Chromuta's own code. Report those
  anyway if you are unsure, but a version bump is usually the whole fix.
- Wrong colours. That is a bug, and belongs in the public issue tracker.

## Disclosure

We will credit you in the release notes unless you prefer otherwise. Please give us a
chance to ship a fix before publishing details.
