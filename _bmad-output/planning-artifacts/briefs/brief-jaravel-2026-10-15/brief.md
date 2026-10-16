---
title: "Product Brief: Jaravel"
status: draft
created: 2026-10-15
updated: 2026-10-15
---

# Product Brief: Jaravel

## Executive Summary

Jaravel is Laravel's server framework rewritten in TypeScript for Bun. It uses Hono as its HTTP foundation and is built for htmx 4 front ends. A Laravel developer should open a Jaravel app and know where everything is: routes, controllers, middleware, form validation, Eloquent-style models and relationships, migrations, queues, mail, notifications, auth, and an Artisan-style CLI that scaffolds all of it.

The approach is what makes this credible rather than another clone. **Laravel's own test suite is the specification.** Laravel 13 has 13,544 test methods across 36 components. Jaravel ports them to `bun test`, and a component is done when its ported tests pass. Progress is a number anyone can check against the full upstream list of tests. That turns an enormous port into a queue of work that can be measured, and that AI agents can run in BMAD build cycles, one story at a time.

Why now: Bun 1.4 ships much of Laravel's infrastructure as built-ins (SQL drivers, Redis, password hashing, S3, a test runner, cron, Temporal). Hono is mature, and htmx 4 has just shipped. Laravel archived Lumen, its own lean option. No framework combines Bun, Hono, an Eloquent-style ORM, an Artisan-style CLI and an htmx-first design.

## The Problem

Developers who love Laravel's productivity but want TypeScript and Bun have no faithful option.

- **AdonisJS** is the established "Laravel for Node". It runs on Node with its own HTTP server, has no official Bun support, and has its own conventions. It's Laravel-*inspired*, not Laravel.
- **Guren** has the right stack (Bun + Hono) but is built around Inertia/React, not server-rendered htmx.
- **Smaller clones** (Stacks, H3ravel) try for Laravel's breadth without a way to prove they match it, and they stall.
- **Laravel itself** means PHP. That rules out one language across the stack, Bun's tooling and speed, and TypeScript's types.

The user has tried AdonisJS and Guren and rejected both. [ASSUMPTION: Adonis isn't Bun/Hono-native and doesn't *feel* like Laravel; Guren is tied to React/Inertia rather than htmx.]

## The Solution

A full port of Laravel 13's server framework (v13.37.0 pinned as the baseline) that keeps Laravel's API and conventions as closely as TypeScript allows. [ASSUMPTION: API fidelity first]

```ts
Route.get('/users', [UserController, 'index'])
const users = await User.where('active', true).with('posts').paginate(15)
```

- **HTTP:** Hono and `Bun.serve` provide the server, middleware ecosystem, streaming and test client. Laravel's router, request/response, sessions and CSRF are ported on top.
- **Templating:** Blade's compiler is ported to output JavaScript render functions, so templates keep `@if`, `@foreach`, `<x-component>`, `@props` and slots. [ASSUMPTION: Blade-style over TSX; `hono/jsx` may be offered as a second engine]
- **htmx 4 is part of the core:** reading and writing `HX-*` headers, `@fragment` / `<hx-partial>` responses, validation failures returned as a fragment with status 422 instead of a 302 redirect, SSE and multipart streaming, and the `QUERY` HTTP method.
- **Bun built-ins over dependencies:** `Bun.sql` / `bun:sqlite`, `Bun.redis`, `Bun.password`, `Bun.S3Client`, `Bun.spawn`, `bun test`, Temporal.
- **Async model, "sync core, async edges":** anything in memory stays synchronous, as in Laravel (collections, `Str`, the container, query building, model attributes). Only IO is awaited. Lazy loading is off by default: `user.posts` must be eager-loaded or `await`-loaded. This is Laravel's own `preventLazyLoading` mode made the default. [ASSUMPTION: accepted as a deliberate break from Laravel]

## What Makes This Different

1. **Conformance you can verify.** Every claim of "works like Laravel" is backed by a ported upstream test. The denominator is the full Laravel inventory, not just the tests ported so far. No competitor offers this.
2. **The only Bun + Hono + htmx-first Laravel.** It renders on the server first, with no SPA front end to keep in sync.
3. **Built by agents, for agents.** The framework is built by AI agents running BMAD cycles, and it ships a **Jaravel Boost**: an MCP server exposing routes, container bindings, schema, logs, the last error and structured test failures. The same tool serves the agents building Jaravel and the agents building apps on it.

Honest note: the moat is execution and verifiability, not technology. The ideas are known. Nobody has done the slow work of passing Laravel's suite.

## Who This Serves

- **Primary:** Laravel developers moving to TypeScript/Bun who want their mental model, conventions and productivity to come with them.
- **Secondary:** TypeScript developers building server-rendered htmx apps who want a batteries-included framework instead of putting Hono middleware together by hand.
- **Tertiary:** AI coding agents. Strong conventions and Boost-style introspection make Jaravel apps easy for agents to build in.
- **First user:** Ed, building his own apps on it.

[ASSUMPTION: public open-source project under the MIT licence (same as Laravel), crediting Laravel.]

## Scope

**In: the full Laravel 13 server surface** (the list of components is in the addendum):

- **The Basics:** routing through templating for htmx.
- **Digging Deeper:** console through rate limiting.
- **Security**
- **Database:** query builder, pagination, migrations, seeding, Redis.
- **Eloquent:** relationships, collections, casts, API resources, serialization, factories.
- **Testing:** HTTP, console, browser, database, mocking.
- **AI:** AI SDK, MCP, Boost, wrapping Vercel `ai` and the MCP TypeScript SDK.

**Out:** MongoDB; Laravel's front-end tooling (Vite, starter kits, Inertia, Livewire).

Scope is full. It is **sequenced** by dependency, not cut. There are nine phases:

1. Foundations and Collections
2. Container and Support
3. Infrastructure (events, logs, filesystem…)
4. Database and Eloquent
5. Cache and Validation
6. The HTTP layer on Hono
7. Views, Console and Mail
8. Queue, Auth and Notifications
9. Foundation, Testing and a Jaravel Testbench

The roughly 10.7k unit tests come first. The 2.8k integration tests unlock once the Testbench exists.

## Success Criteria

- **Conformance rate:** ported upstream tests passing, out of the full Laravel 13 list, published per component on a dashboard. Phase gates are set per epic.
- **Ratchet holds:** CI fails on any unexpected failure *or* unexpected pass. Every skip has a reason from a fixed list, so silent skips are impossible.
- **Built on itself:** Ed ships a real htmx app on Jaravel. [ASSUMPTION: as the first milestone after the HTTP + View phases]
- **Agent throughput:** stories finished per BMAD cycle without a human rescue, which shows the pipeline scales.
- **Keeps up with Laravel:** a re-sync epic tracks Laravel 14 (expected about Q1 2027).

## Risks and Unknowns

- **Size:** 275k lines of PHP source and 296k lines of tests. Prior ports show the last few percent of conformance takes the longest.
- **Breaks from Laravel that can't be avoided:** queued closures (JavaScript can't serialize them), container autowiring (TypeScript erases types, so explicit tokens are needed), async IO, and tests that check generated PHP (Blade output, `make:*` stubs). Each needs a decision record and a test-adaptation rule.
- **Hard parts we'd have to build ourselves:** keeping transaction state per request with AsyncLocalStorage, PHP-array semantics in Collections, a Symfony-compatible console core, and Carbon on Temporal.
- **Open checks:** how complete Temporal is in Bun 1.4 (the research disagreed), whether `Bun.serve` accepts `QUERY`, Bun's bcrypt behaviour compared with PHP, Bun Redis Cluster support, and whether Hono's router or a ported Laravel router does route matching.

## Vision

In 2–3 years Jaravel is the default answer to "Laravel, but TypeScript". It tracks Laravel releases within weeks and is verified by a public conformance dashboard. Its agent tooling means a developer, or an agent, can describe an htmx app and have it scaffolded, tested and running on Bun the Laravel way.
