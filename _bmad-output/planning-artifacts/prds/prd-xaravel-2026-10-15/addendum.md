# PRD Addendum: Xaravel

This addendum holds the technical detail behind the PRD for the architecture and epics workflows. Landscape, research and test counts are in the brief's addendum and research notes at `../../briefs/brief-xaravel-2026-10-15/`, and are not repeated here.

## Repository and distribution (confirmed 2026-10-15)

- **Name:** the product was renamed from Jaravel to **Xaravel** on 2026-10-15, to keep distance from the "Laravel" trademark (see the Trademark section). The earlier name had other problems too: `github.com/jaravel` belongs to an inactive user, and the unscoped npm `jaravel` belongs to another maintainer.
- **GitHub:** the org `github.com/xaravel` is owned by Ed (registered 2026-10-15).
  - The monorepo lives at `xaravel/framework`, mirroring `laravel/framework`. It was created as a public repo on 2026-10-15 (https://github.com/xaravel/framework). It uses Bun workspaces, with one workspace per Package.
  - `xaravel/xaravel` is reserved for a read-only mirror of the Skeleton, mirroring `laravel/laravel`, if one is ever needed for templates.
- **npm** (checked 2026-10-15):
  - The `@xaravel` scope, the unscoped `xaravel`, and `create-xaravel` were all unregistered.
  - Claim the scope by creating a free org named `xaravel` at https://www.npmjs.com/org/create. (`npm org create` is not a real command. The `npm org` CLI only manages members of an org that already exists.)
  - Optionally, publish a placeholder for the unscoped `xaravel` so nobody else takes it.
  - The meta-package is `@xaravel/framework`.
- **Installer:** `create-xaravel`, so `bun create xaravel <name>` works.

## Trademark and licensing (researched 2026-10-15)

- **Laravel's trademark policy** (https://laravel.com/legal/trademark): "Laravel and the Laravel logo are trademarks of Laravel Holdings Inc."
  - **Allowed without a licence:** referring to Laravel, and saying your software is "built on or compatible with Laravel".
  - **Naming rules:** "Laravel" must not be the first word of a name, and nothing may imply official endorsement.
  - **Needs a licence:** commercial use, domain names containing "Laravel", and services that use the name or logo.
  - **Contact:** legal@laravel.com, or the request form on the policy page.
- **What Xaravel does with that:**
  - The name doesn't contain "Laravel".
  - It is described as "a TypeScript port of Laravel" and carries a clear notice that it is not affiliated with Laravel Holdings.
  - It uses no Laravel logo or artwork.
  - It is not a commercial product, and it uses no domain containing "Laravel".
  - The CLI command stays `bun artisan`, because "Artisan" isn't listed as a mark in the policy. Revisit this if Laravel Holdings objects.
  - Optional: ask Laravel Holdings for a blessing through the form. Being friendly with upstream costs nothing.
- **Code and docs licences:** `laravel/framework` and `laravel/docs` are both MIT. Ported code and adapted documentation must keep Laravel's copyright notice (NFR-8).

### Sketch of the monorepo layout

This is a starting point for the architecture document, not a decision:

```
xaravel/
  packages/
    collections/  support/  container/  config/  ...   # one per Upstream Component → @xaravel/<name>
    htmx/  mockery/  testbench/  boost/                   # Xaravel Components
    framework/                                           # @xaravel/framework meta-package
  skeleton/                                              # laravel/laravel equivalent
  installer/                                             # create-xaravel
  conformance/                                           # inventory, expectations, harness, dashboard
    upstream/                                            # pinned Laravel checkout (read-only) + Oracle container
  docs/
  PORTING.md
  decisions/                                             # Divergence Records (DIV-1..8) + other ADRs
```

## Mapping Upstream Components to Packages

Mostly 1:1, from `src/Illuminate/<Name>` to `@xaravel/<name-kebab>`. Contracts are split per Component as TypeScript interfaces inside each Package, not shipped as one monolithic contracts package. `laravel/ai`, `laravel/mcp` and `laravel/boost` map to `@xaravel/ai`, `@xaravel/mcp` and `@xaravel/boost`.

## API mapping examples (parity rule, PRD §5.1)

| Laravel (PHP) | Xaravel (TS) | Note |
|---|---|---|
| `Route::get('/users', [UserController::class, 'index']);` | `Route.get('/users', [UserController, 'index'])` | syntax only |
| `$users = User::where('active', 1)->with('posts')->get();` | `const users = await User.where('active', 1).with('posts').get()` | DIV-1 |
| `$user->posts` (lazy) | `user.posts` throws unless loaded; `await user.load('posts')` | DIV-2 |
| `public function __construct(private Mailer $mailer)` | `static inject = [Mailer]; constructor(private mailer: Mailer)` | DIV-3 (shape TBD in architecture) |
| `dispatch(function () use ($podcast) { … })` | `dispatch(async ({ podcast }) => …, { podcast })` | DIV-4 |
| `$request->validate([...])` | `await request.validate({...})` | DIV-1 (IO rules) |
| `collect([1, 2, 3])->map(fn ($x) => $x * 2)` | `collect([1, 2, 3]).map(x => x * 2)` | sync, no divergence |
| `php artisan make:model Invoice -mfc` | `bun artisan make:model Invoice -mfc` | CLI name kept (NFR-8) |

## Review-pass rationale (2026-10-15)

The four finalize reviewers were the brief check, the research check, the rubric walk and the adversarial review. Their full files are in this folder (`reconcile-*.md`, `review-*.md`). They agreed on two criticals, which the PRD now addresses:

1. **The alpha depended on Phase 9.** In Upstream terms, Foundation is a grab-bag: the HTTP kernel, console generators and testing helpers all live there. So it is split by sub-area across Phases 6 and 7. Testbench moves to Phase 7, ending the period in which 2,809 integration tests (about 21%) were blocked. Blade moves to Phase 6, because htmx Fragments need it. Boost framework mode uses the MCP TypeScript SDK directly in Phase 0, because the agents building Xaravel need it from the start.
2. **The grader could be edited by the agents being graded.** The fix is a set of new requirements:
   - Protected Paths (FR-112), and Expectations File edits limited to the Story's own Test IDs (FR-4);
   - a Skip Reason rule for every value (FR-3);
   - an assertion floor (FR-113), Fidelity Review (FR-111) and Escalations (FR-114);
   - a done definition for Xaravel Components (FR-115).

Medium and low findings are in the review files. They were triaged in a later pass; the decision for each, and the deferred items with their owners, are in `review-triage.md`.
