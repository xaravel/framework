# Xaravel

[![Built with the BMAD Method](https://img.shields.io/badge/built%20with-BMAD%20Method-8A2BE2)](https://github.com/bmad-code-org/BMAD-METHOD)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**A TypeScript port of Laravel for Bun, built for htmx 4.**

Xaravel aims to be Laravel, in TypeScript: the same routes, controllers, Blade views, Eloquent models, migrations, queues, mail, auth and Artisan-style CLI. It runs natively on Bun and renders on the server for htmx 4 front ends.

Laravel's own test suite is the specification. Every upstream test is inventoried and ported to `bun test`, and progress is measured against the full suite.

> **Status: planning.** No code yet. The product brief and PRD are in [`_bmad-output/planning-artifacts/`](_bmad-output/planning-artifacts/).

## Built with the BMAD Method

Xaravel is planned and built with the [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD), an open-source, agent-driven workflow for software projects:

```
Product brief → PRD → Architecture → Epics & stories → Sprint planning → build cycles
     ✅           ✅        next
```

Each Story names the upstream Laravel tests it has to pass. AI agents implement Stories in unattended build cycles, under guardrails that stop them weakening tests or editing their own grader, and the Maintainer reviews each completed Epic. The BMAD tooling lives in [`_bmad/`](_bmad/) and [`.claude/skills/`](.claude/skills/).

Thank you to BMad Code, LLC and the BMAD community for making this way of working possible.

## Not affiliated with Laravel

Xaravel is an independent, non-commercial open-source project. It is **not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.** "Laravel" and the Laravel logo are trademarks of Laravel Holdings Inc. They are used here only to describe what Xaravel is a port of, in line with [Laravel's trademark policy](https://laravel.com/legal/trademark).

## Credits and licence

- [Laravel](https://github.com/laravel/framework), by Taylor Otwell and contributors (MIT). Xaravel is derived from it.
- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD), by BMad Code, LLC (MIT), provides the planning and build workflow.

Xaravel is released under the MIT License; see [LICENSE](LICENSE).
