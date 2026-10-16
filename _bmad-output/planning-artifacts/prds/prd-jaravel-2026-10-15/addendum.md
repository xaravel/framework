# PRD Addendum: Jaravel

This addendum holds the technical detail behind the PRD for the architecture and epics workflows. Landscape, research and test counts are in the brief's addendum and research notes at `../../briefs/brief-jaravel-2026-10-15/`, and are not repeated here.

## Repository and distribution (confirmed 2026-10-15)

- **Repo:** `github.com/edanisko/jaravel`, a monorepo using Bun workspaces with one workspace per Package. It can be transferred to a GitHub organization later; GitHub keeps redirects. The name `github.com/jaravel` belongs to an inactive user account.
- **npm:**
  - Packages are published under the `@jaravel` scope. The scope appeared unregistered on 2026-10-15; Ed claims it with `npm org create jaravel`.
  - The unscoped `jaravel` package belongs to an unrelated maintainer (0.0.1 placeholder, 2024), so don't use it.
  - The meta-package is `@jaravel/framework`.
- **Installer:** `create-jaravel` (free on 2026-10-15), so `bun create jaravel <name>` works.

### Sketch of the monorepo layout

This is a starting point for the architecture document, not a decision:

```
jaravel/
  packages/
    collections/  support/  container/  config/  ...   # one per Upstream Component → @jaravel/<name>
    htmx/  mockery/  testbench/  boost/                   # Jaravel Components
    framework/                                           # @jaravel/framework meta-package
  skeleton/                                              # laravel/laravel equivalent
  installer/                                             # create-jaravel
  conformance/                                           # inventory, expectations, harness, dashboard
    upstream/                                            # pinned Laravel checkout (read-only) + Oracle container
  docs/
  PORTING.md
  decisions/                                             # Divergence Records (DIV-1..8) + other ADRs
```

## Mapping Upstream Components to Packages

Mostly 1:1, from `src/Illuminate/<Name>` to `@jaravel/<name-kebab>`. Contracts are split per Component as TypeScript interfaces inside each Package, not shipped as one monolithic contracts package. `laravel/ai`, `laravel/mcp` and `laravel/boost` map to `@jaravel/ai`, `@jaravel/mcp` and `@jaravel/boost`.

## API mapping examples (parity rule, PRD §5.1)

| Laravel (PHP) | Jaravel (TS) | Note |
|---|---|---|
| `Route::get('/users', [UserController::class, 'index']);` | `Route.get('/users', [UserController, 'index'])` | syntax only |
| `$users = User::where('active', 1)->with('posts')->get();` | `const users = await User.where('active', 1).with('posts').get()` | DIV-1 |
| `$user->posts` (lazy) | `user.posts` throws unless loaded; `await user.load('posts')` | DIV-2 |
| `public function __construct(private Mailer $mailer)` | `static inject = [Mailer]; constructor(private mailer: Mailer)` | DIV-3 (shape TBD in architecture) |
| `dispatch(function () use ($podcast) { … })` | `dispatch(async ({ podcast }) => …, { podcast })` | DIV-4 |
| `$request->validate([...])` | `await request.validate({...})` | DIV-1 (IO rules) |
| `collect([1, 2, 3])->map(fn ($x) => $x * 2)` | `collect([1, 2, 3]).map(x => x * 2)` | sync, no divergence |
| `php artisan make:model Invoice -mfc` | `bun artisan make:model Invoice -mfc` | CLI name pending OQ-1 |

## Phase-gate note

[NOTE FOR PM] in PRD §7.2: the Maintainer's dogfood app probably needs Auth (FR-92) and possibly Queue (FR-85), which sit in Phase 8. Decide during epic planning whether to pull Auth forward into the alpha, since Phase 8 depends on Phase 7 anyway.
