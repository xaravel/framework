# Security Policy

Xaravel is a TypeScript port of Laravel. It is an independent project and is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc. Report vulnerabilities in Xaravel to Xaravel, not to Laravel.

## Supported versions

Xaravel is pre-1.0. Only the latest published `0.x` release, and `main`, receive security fixes. All `@xaravel/*` packages and `create-xaravel` share one lockstep version, so a fix ships in every package at once.

| Version | Supported |
| --- | --- |
| latest `0.x` release | yes |
| `main` | yes |
| any older release | no |

## Reporting a vulnerability

Report privately through GitHub Security Advisories:

<https://github.com/xaravel/framework/security/advisories/new>

**Do not open a public issue, pull request or discussion for a security problem.** If one is opened by mistake, the Maintainer will hide or close it and move the report to a private advisory.

Please include:

- the affected package(s) and version or commit;
- a description of the issue and its impact;
- steps or a minimal proof of concept to reproduce it;
- any suggested fix or mitigation.

## What to expect

- **Acknowledgement** within 3 working days of the report.
- **Initial assessment** (confirmed or not, and a severity) within 7 days.
- **Fix:** we aim to release a fix for a critical or high severity issue within 30 days, and for a lower severity issue within 90 days. If a fix needs longer, we will tell you why and agree a new date.
- We keep you informed of progress through the advisory until it is resolved.

## Coordinated disclosure

We follow coordinated disclosure. Please give us the time above to release a fix before you disclose the issue publicly. Once a fix is released we publish the GitHub Security Advisory, request a CVE where appropriate, and credit the reporter unless you ask us not to.

If an issue also affects Laravel itself, we will encourage you to report it to Laravel through its own security policy as well.

## Scope

In scope:

- the code in this repository: every `@xaravel/*` package, `create-xaravel`, the application skeleton and the release pipeline;
- the published npm packages built from it.

Out of scope:

- vulnerabilities in Laravel or PHP themselves (report them to Laravel);
- vulnerabilities in Bun or third-party dependencies, unless Xaravel's use of them makes the issue exploitable (report the underlying issue upstream as well);
- applications built with Xaravel, where the issue is in the application's own code or configuration;
- the planning and tooling files (`_bmad/`, `_bmad-output/`, `.claude/`), unless they affect the published packages.
