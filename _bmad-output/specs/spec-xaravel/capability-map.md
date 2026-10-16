# Capability Map

Maps each capability in SPEC.md to its PRD FRs, the Components and packages that deliver it, its Phase (PRD §7.3, as amended), and the architecture ADs that govern it. FR text, testable consequences and DIV rules live in the PRD. AD rules live in the architecture spine. Both are adopted companions; cite their IDs, never restate their text.

**Kinds of Component.** *Upstream* Components are accepted on Test IDs (Global rules, PRD §4). *Xaravel* Components are accepted on Xaravel Tests (FR-115).

| CAP | FRs | Components (kind) → packages | Phase | Governing ADs | Journeys |
| --- | --- | --- | --- | --- | --- |
| CAP-1 Conformance System | FR-1..9, FR-111..116 | Conformance System, Mockery (Xaravel) → `conformance/`, `packages/assert`, `packages/mockery`, `tools/` | 0 | AD-15, AD-16, AD-17, AD-21, AD-27, AD-28 | UJ-4, UJ-5, UJ-7 |
| CAP-2 Packages, runtime, distribution | FR-10..14 | all → `packages/*`, `packages/runtime`, `packages/contracts`, `packages/framework` | 0 (scaffolding), 1 (runtime, contracts), each Phase (release) | AD-1, AD-2, AD-3, AD-18, AD-19, AD-22 | — |
| CAP-3 Skeleton and Installer | FR-15..17 | Skeleton, Installer (Xaravel) → `skeleton/`, `installer/` | 7 (auth pages and dashboard in 8, with Auth) | AD-3, AD-10, AD-12, AD-25 | UJ-1 |
| CAP-4 Foundation and container | FR-18..22 | Foundation core, Container, Config (Upstream); Class Registry in runtime (Xaravel) → `packages/foundation`, `container`, `config`, `runtime` | 1 (runtime, Config), 2 (Container), 6 (Foundation core) | AD-1, AD-2, AD-4, AD-5, AD-10, AD-19 | — |
| CAP-5 Support and Collections | FR-23..26 | Collections, Support, Macroable, Conditionable, Reflection, Pipeline (Upstream) → one package each | 1, 2, 3 (Pipeline) | AD-6, AD-9, AD-22, AD-26 | — |
| CAP-6 HTTP layer | FR-27..36 | Http, Routing, Cookie, Session, Log (Upstream); http-foundation port (Xaravel) → one package each | 3 (Log, http-foundation), 6 | AD-4, AD-5, AD-6, AD-12, AD-22, AD-23 | — |
| CAP-7 htmx 4 Integration | FR-37..43 | htmx Integration (Xaravel) → `packages/htmx` | 6 (TestResponse assertions in 7) | AD-11, AD-12 | UJ-2 |
| CAP-8 Blade | FR-44..49 | View (Upstream) → `packages/view` | 6 | AD-11 | UJ-2 |
| CAP-9 Validation | FR-50..52 | Validation (Upstream) → `packages/validation` | 5 | AD-6, AD-12 | UJ-2 |
| CAP-10 Database | FR-53..60 | Database (query, schema, migrations), Pagination, Redis (Upstream) → `packages/database`, `pagination`, `redis` | 4, 5 | AD-5, AD-6, AD-9, AD-20 | UJ-3 |
| CAP-11 Eloquent | FR-61..68 | Database: Eloquent (Upstream) → `packages/database` (eloquent subpath) | 4 | AD-7, AD-8, AD-9, AD-10, AD-26 | UJ-1 |
| CAP-12 Console | FR-69..73 | Console, Foundation console (Upstream) → `packages/console`, `foundation` | 7 | AD-3, AD-10, AD-22, AD-25 | UJ-1 |
| CAP-13 Infrastructure services | FR-74..84 | Cache, Events, Filesystem, Encryption, Hashing, Process, Translation, Concurrency, Image, JsonSchema, Support (Context, HTTP client) (Upstream); mime and finder ports (Xaravel) → one package each | 1 (JsonSchema), 3, 5 (Cache), 6 (HTTP client), 8 (Concurrency, Image) | AD-1, AD-5, AD-6, AD-22, AD-23 | — |
| CAP-14 Queues and Bus | FR-85..88 | Queue, Bus (Upstream); serializable-closure (Xaravel) → `packages/queue`, `bus`, `serializable-closure` | 3 (Bus, serializable-closure), 8 (Queue) | AD-13, AD-14, AD-24 | UJ-3 |
| CAP-15 Mail, Notifications, Broadcasting | FR-89..91 | Mail, Notifications, Broadcasting (Upstream) → one package each | 7 (Mail), 8 | AD-6, AD-22, AD-24 | — |
| CAP-16 Auth | FR-92..95 | Auth (Upstream) → `packages/auth` | 8 | AD-5, AD-6, AD-9 | — |
| CAP-17 App testing toolkit | FR-96..102 | Testing, Foundation testing (Upstream); Testbench, Mockery (Xaravel) → `packages/testing`, `testbench`, `mockery` | 0 (Mockery), 7; FR-102 post-alpha | AD-5, AD-12, AD-25 | — |
| CAP-18 AI and MCP | FR-103..104 | `laravel/mcp`, `laravel/ai` (Upstream) → `packages/mcp`, `ai` | 8 (MCP); FR-103 post-alpha | AD-2 | — |
| CAP-19 Xaravel Boost | FR-105..110 | Boost (Xaravel) → `packages/boost`, `tools/boost-framework` | 0 (framework mode, FR-109), 8 (app tools); FR-108 post-alpha | AD-2, AD-15 | UJ-4, UJ-6 |
| CAP-20 Public API parity | PRD §5.1–5.2 (DIV-1..12) | all | all | AD-6, AD-9, AD-15, AD-26 | — |

## Cross-cutting rules every capability inherits

- **Done definition for a Story:** PRD §3 "Story", and the Global rules in PRD §4.
- **Cross-cutting NFRs:** NFR-1..NFR-11 (PRD §6).
- **Shared seams:** the cross-package seams named in the spine (AD-1 contracts, AD-5 Scope Frames, AD-12 htmx seams, AD-19 runtime, AD-23 codecs, AD-24 payloads, AD-25 test lifecycle). No Epic may define a seam that isn't on that list (AD-27).
