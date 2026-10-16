---
title: "Product Brief: Jaravel"
status: final
created: 2026-10-15
updated: 2026-10-15
---

# Product Brief: Jaravel

## Executive Summary

Jaravel is Laravel's server framework rewritten in TypeScript, running natively on Bun and built for htmx 4 front ends. A Laravel developer should open a Jaravel app and know where everything is: routes, controllers, middleware, form validation, Blade templates, Eloquent models and relationships, migrations, queues, mail, notifications, auth, and an Artisan-style CLI that scaffolds all of it.

The approach is what makes this credible rather than another clone. **Laravel's own test suite is the specification.** Laravel 13 has 13,544 test methods across 36 components. Jaravel ports them to `bun test`, and a component is done when its ported tests pass. Progress is a number anyone can check against the full upstream list of tests. That turns an enormous port into a queue of work that AI agents can run unattended, in parallel, through BMAD build cycles.

Why now: Bun 1.4 ships much of Laravel's infrastructure as built-ins (SQL drivers, Redis, password hashing, S3, a test runner, cron, Temporal). htmx 4 has just shipped. Laravel archived Lumen, its own lean option. And agent-driven ports of large codebases have now been done with tests as the oracle (Bun's own Zig→Rust rewrite, July 2026). No framework combines Bun, Laravel's real API, and an htmx-first design.

## The Problem

Laravel developers who move to TypeScript lose Laravel. What's available is Laravel-*inspired*, not Laravel:

- **AdonisJS** is the established "Laravel for Node". It's on Node, not Bun, and has its own conventions.
- **Guren** is on Bun but built around Inertia/React, not server-rendered htmx.
- **Smaller clones** (Stacks, H3ravel) try for Laravel's breadth without a way to prove they match it, and they stall.

Ed has tried Adonis and Guren: "They're not Laravel. If you're going to make me write TypeScript, the first thing I'm doing is writing Laravel in TypeScript."

## The Solution

A full port of Laravel 13's server framework that keeps its API and conventions as closely as TypeScript allows:

```ts
Route.get('/users', [UserController, 'index'])
const users = await User.where('active', true).with('posts').paginate(15)
```

- **HTTP:** directly on `Bun.serve` with Web `Request`/`Response`. Laravel's router, middleware pipeline, request/response, sessions and CSRF are ported, so their upstream tests apply. No Hono or other third-party HTTP framework.
- **Blade:** Blade's compiler is ported to produce TypeScript/JS render functions instead of PHP: `@if`, `@foreach`, `<x-component>`, `@props`, slots and `@fragment`.
- **htmx 4:** built into the core as the front end, with `HX-*` request and response headers, `<hx-partial>` / fragment responses, validation failures returned as a fragment with status 422 instead of a redirect, SSE and multipart streaming, and the `QUERY` method. There are no React, Svelte or Livewire integrations.
- **Database:** SQLite in development, Postgres in production, switched by the same `.env` keys as Laravel (`DB_CONNECTION`, …). Grammars for MySQL, MariaDB and SQL Server are ported too, because their tests need no server. Their drivers come after SQLite and Postgres.
- **Assets:** a Laravel-style `@vite` directive and manifest integration. Vite runs on Bun.
- **Bun built-ins over dependencies:** `Bun.sql` / `bun:sqlite`, `Bun.redis`, `Bun.password`, `Bun.S3Client`, `Bun.spawn`, `bun test`, Temporal.
- **Async model, "sync core, async edges":** anything in memory stays synchronous, as in Laravel. Only IO is awaited. Lazy loading is off by default (Laravel's `preventLazyLoading`): relations are loaded with `with()` or `await load()`.

## What Makes This Different

1. **It's Laravel, and you can check.** Every "works like Laravel" claim is backed by a ported upstream test, measured against the full inventory of Laravel's tests on a public conformance dashboard.
2. **Bun-native and htmx-first.** It renders on the server first, has no SPA front end to keep in sync, and has no adapter layers.
3. **Jaravel Boost.** An MCP server that exposes an app's routes (including htmx fragment routes), container bindings, config, schema, logs, the last error and structured test failures. The agents building Jaravel use it first, and the agents building apps on it use it after.

Honest note: the moat is execution and verifiability, not technology. Nobody has done the slow work of passing Laravel's suite.

## Who This Serves

- **Primary:** Laravel developers who need or want TypeScript and Bun, and who refuse to give up Laravel to get them.
- **Secondary:** TypeScript developers building server-rendered htmx apps who want a batteries-included framework.
- **Also:** AI coding agents. Strong conventions plus Boost make Jaravel apps easy for agents to build in.
- **First user:** Ed.

Jaravel is a public open-source project under the MIT licence (the same as Laravel), crediting Laravel.

## Scope

**In: the full Laravel 13 server surface.** That covers the Basics, Digging Deeper, Security, Database, Eloquent, Testing, and AI (AI SDK, MCP, Boost). The list of components is in the addendum.

**Out:** MongoDB, and front-end stacks other than htmx (Inertia/React, Svelte, Livewire/Alpine starter kits).

**Things we build because no TypeScript equivalent exists:** a Testbench (a skeleton test app), a Mockery-compatible mocking library, PHPUnit-style assertion matchers, a Symfony-compatible console core, a Carbon equivalent on Temporal, the HTTP foundation, and the router.

Scope is full. It is **sequenced** by dependency, not cut, across nine phases:

1. Foundations and Collections
2. Container and Support
3. Infrastructure
4. Database and Eloquent
5. Cache and Validation
6. HTTP and Routing
7. Blade, Console and Mail
8. Queue, Auth and Notifications
9. Foundation, Testing and Testbench

## How It Gets Built

- **Pipeline:** pin the upstream version, then inventory every test with a stable ID. Write `PORTING.md` (the idiom and decision rules) and pilot on Support. Each story then runs: translate the tests, implement against them, and send the result to adversarial reviewers. The method and prior art are in the addendum.
- **Parallelism:** agents run unattended, fanned out. Components in the same phase are independent, so their epics run in parallel, one git worktree per story. `bmad-build-auto` runs the loop. Ed reviews each completed epic.
- **Ratchet:** CI fails on any unexpected failure *or* unexpected pass. Every skip has a reason from a fixed list.
- **Versioning:** the port is pinned to an exact upstream tag (v13.37.0) so the target doesn't move mid-epic. At each phase boundary the pin moves to the latest 13.x, and new or changed upstream tests become stories. Jaravel's major versions mirror Laravel's (Jaravel 13 = Laravel 13), and Laravel 14 (about Q1 2027) gets its own re-sync epic.

## Success Criteria

- **Conformance rate:** ported upstream tests passing, out of all of Laravel 13's tests, per component. It only moves forward.
- **Unattended throughput:** epics finished by agents that pass Ed's review without needing rework.
- **Dogfooding:** Ed ships a real htmx app on Jaravel, as the first milestone after the HTTP and Blade phases.
- **Currency:** stays within one 13.x pin step of upstream, and ships Jaravel 14 after Laravel 14.

## Risks and Unknowns

- **Size:** 275k lines of PHP source and 296k lines of tests. Prior ports show the last few percent of conformance takes the longest.
- **Breaks from Laravel that can't be avoided**, each with a decision record:
  - **Queued closures.** JavaScript can't serialize a closure's captured variables. Jaravel will support job classes fully, plus closures that take their data as explicit arguments.
  - **Container autowiring.** TypeScript erases types, so explicit injection tokens are needed.
  - **Async IO.** Only IO is awaited; see "sync core, async edges" under The Solution.
  - **Generated code.** Blade compiler tests and `make:*` stubs assert generated PHP. They become TS and rendered-HTML assertions, checked against PHP Laravel's output.
- **Hard parts we'd have to build ourselves:** keeping transaction state per request in a long-running server (AsyncLocalStorage), PHP-array semantics in Collections, a Symfony-compatible console, and Carbon.
- **Open checks:** how complete Temporal is in Bun 1.4, whether `Bun.serve` accepts `QUERY`, Bun's bcrypt behaviour compared with PHP, and Bun Redis Cluster support.

## Vision

In 2–3 years Jaravel is the answer to "Laravel, but TypeScript". It tracks Laravel releases within weeks and has a public conformance dashboard to prove it. With Boost, a developer or an agent can describe an htmx app and have it scaffolded, tested and running on Bun, the Laravel way.
