---
title: 'Review: Laravel parity lens'
reviews: ../ARCHITECTURE-SPINE.md
sources:
  - ../../../prds/prd-xaravel-2026-10-15/prd.md (§4, §5)
  - ../../../prds/prd-xaravel-2026-10-15/addendum.md (API mapping table)
lens: 'Experienced Laravel developer writing day-to-day app code under each AD'
created: '2026-10-16'
status: findings
---

# Review: Laravel parity lens

**Reviewer stance.** I am a Laravel developer who has shipped Laravel 10–13 apps. For each AD, I wrote the app code I would write in Xaravel under the AD as worded: models, controllers, Form Requests, jobs, notifications, mailables, Blade, providers, config and feature tests. Then I compared that code with the Laravel 13 version. PRD §5.1 is the yardstick: same names, arguments, defaults and behaviour. The only allowed differences are TypeScript syntax and the listed DIVs.

**Fixed by the Maintainer, not reopened here.** Relationships use accessor decorators and the `related()` builder. Injection uses `@inject({ name: Token })`. BIGINT becomes `number` unless cast. Scope Frames use overlay semantics. Some findings below are about how these decisions *interact* with other ADs, or about gaps in their wording. None of them proposes a different choice.

## Verdict

The spine has the right shape. AD-4, AD-5, AD-8 and AD-12 produce code a Laravel developer reads without effort. Three problems need fixing before the Eloquent, HTTP and Testing Epics start, because each one changes ordinary code:

- **JavaScript class semantics.** Field-initializer ordering and PHP's separate property and method namespaces conflict with Laravel's class shapes. Nothing in the spine handles this outside relationships.
- **Scope Frame nesting.** It is undefined, and as worded it breaks Laravel's feature-test model.
- **The AD-6 derivation rule.** Applied literally, it makes `request.user()` async.

## Findings index

| ID | Sev | AD | Title |
| --- | --- | --- | --- |
| F-01 | Critical | AD-7 | Subclass field initializers run *after* `Model`'s constructor, so `new Post(attrs)` / `create()` fill before `fillable`, `casts` and defaults exist |
| F-02 | Critical | AD-7, AD-8, cross-cutting | PHP has separate property and method namespaces and JS has one: `casts`/`casts()`, `title` column vs `title()` accessor, Queueable `delay`/`middleware`, Mailable `attachments`/`subject`, Request `user`/`user()` |
| F-03 | Critical | AD-5 | Frame nesting is undefined. As worded, a feature-test request runs in a sibling frame and loses fakes, `instance()`, config, the RefreshDatabase transaction and post-request auth/session assertions |
| F-04 | High | AD-6 | The derivation rule makes `request.user()`, `Auth.user()`, `check()` and `id()` async, a large DX regression that DIV-1 doesn't require |
| F-05 | High | AD-5 | `DB.transaction()` opens a child frame, which silently discards `Auth.login()`, `config()`, `Context.add()` and `setLocale()` made inside the callback |
| F-06 | High | AD-5 | "Boot once per process" conflicts with Laravel's app-per-test lifecycle (`createApplication`, `refreshApplication`, Testbench `defineEnvironment` / `getPackageProviders`) |
| F-07 | High | AD-1 | "Binds and resolves tokens, never strings" removes `app('cache')`, string bindings, core aliases and string facade accessors |
| F-08 | High | AD-4 | Closures can't declare injection (closure routes with model binding, closure commands, `app.call(fn)`), and Laravel 11+ contextual attributes can't be expressed |
| F-09 | High | AD-10 | The PSR-4 map covers only `App\` and nine directories, so `User.factory()`, `db:seed --class`, class-based Blade components and `route:cache` fail |
| F-10 | High | AD-9 × AD-7 | An instance-field marker brand is captured as an attribute by the Model Proxy (`User implements MustVerifyEmail`), and class-level checks can't see it |
| F-11 | High | AD-9 | BIGINT: the Connection throws before a `'bigint'` cast can apply. The query builder has no opt-in, and `JSON.stringify(bigint)` crashes responses |
| F-12 | High | AD-14 | Queued closures can't reference facades, models or helpers. The dispatch rule contradicts the worker rule |
| F-13 | Medium | AD-7, AD-8 | Model idioms beyond attributes and relationships are left open: accessors, local scopes, traits, `withCount` typing, PHP attributes |
| F-14 | Medium | AD-8 | Relationship-definition details: what the callback receives and returns, `through()`, `resolveRelationUsing`, mutator side effects, typed `related()`, PRD `relation()` wording |
| F-15 | Medium | AD-11 | Blade: variable scope in strict ESM, fragment direct-call semantics, the custom-directive ABI, `$` sigils |
| F-16 | Medium | AD-6 | Contract-method async classification is circular (`Storage.url()` in accessors). Async Gate needs predicate companions. Returning builders from `async` app functions runs them |
| F-17 | Medium | cross-cutting | No convention for PHP named arguments (`new Envelope(subject: …)`, `Attribute::make(get: …)`) |
| F-18 | Medium | AD-3 | The home of global helpers and the Blade scope are unspecified. "No default exports" conflicts with config files and anonymous migrations |
| F-19 | Medium | AD-4 | Decorator/parameter drift is unchecked, the `primitive` token is verbose, scalar coercion and snake/camel matching are missing, listener discovery is unspecified |
| F-20 | Medium | AD-5 | Static "configure-once" APIs, and where `singleton` resolutions are cached |
| F-21 | Medium | AD-1, AD-10 | Class-keyed maps (`$singletons`, `$bindings`, `$policies`, `$listen`) and class references in `config/*.ts` under `config:cache` |
| F-22 | Medium | AD-5, FR-96 | The app test authoring shape (`this`, arrow functions, fluent `->assert*()` chains) is undecided |
| F-23 | Low | AD-8 | Proposed meaning for `automaticallyEagerLoadRelationships()`, and `handleLazyLoadingViolationUsing` |
| F-24 | Low | AD-7 | Proxy surface: spread / `Object.keys`, `#private`, assigning to a relationship accessor |
| F-25 | Low | AD-13 | One job at a time per child, or a timeout kill takes its siblings with it |
| F-26 | Low | AD-11 | `View#toString()` and `(string) view()` |
| F-27 | Low | AD-2, AD-12 | The meta-package must carry optional peers, and htmx type augmentation needs an import in the type program |

---

## Part 1: One app slice, Laravel vs Xaravel-as-spined

This slice is what a developer writes in week one: a `Post` model, a controller, a Form Request, a job, a notification, a mailable, a provider, a Blade view with a fragment, and a feature test. Callouts point to findings.

### Model

```php
// Laravel 13 — app/Models/Post.php
class Post extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = ['title', 'body', 'status', 'published_at'];
    protected $attributes = ['status' => 'draft', 'options' => '[]'];
    protected $hidden = ['internal_notes'];

    protected function casts(): array
    {
        return ['published_at' => 'datetime', 'options' => 'array', 'status' => PostStatus::class];
    }

    public function author(): BelongsTo   { return $this->belongsTo(User::class, 'user_id'); }
    public function comments(): HasMany   { return $this->hasMany(Comment::class); }
    public function latestComment(): HasOne { return $this->comments()->one()->latestOfMany(); }

    protected function title(): Attribute
    {
        return Attribute::make(get: fn (string $value) => ucfirst($value));
    }

    #[Scope]
    protected function published(Builder $query): void
    {
        $query->whereNotNull('published_at');
    }
}
```

```ts
// Xaravel as the spine reads today — app/Models/Post.ts
export class Post extends Model /* HasFactory, SoftDeletes: mixin shape deferred to PORTING.md (F-13) */ {
  fillable = ['title', 'body', 'status', 'published_at']   // F-01: not yet assigned when Model's ctor runs fill()
  hidden = ['internal_notes']
  status: PostStatus = PostStatus.Draft                     // F-01: AD-7 default; raw 'draft' or cast value? runs after fill()
  options: Record<string, unknown> = {}                     // F-01: Laravel's raw '[]' won't type-check here

  casts() {                                                 // F-02: Model can't have both a `casts` field and a `casts()` method
    return { published_at: 'datetime', options: 'array', status: PostStatus }
  }

  declare id: number
  declare title: string                                     // F-02: "Duplicate identifier 'title'" with title() below
  declare body: string
  declare user_id: number
  declare published_at: Carbon | null

  @belongsTo(() => User, 'user_id') accessor author!: User
  @hasMany(() => Comment) accessor comments!: Collection<Comment>
  @hasOne(() => Comment, (q) => q.latestOfMany()) accessor latestComment!: Comment | null   // F-14: can't express ->one()

  protected title() {                                       // F-02: a prototype member, so the Proxy passes it through:
    return Attribute.make({ get: (v: string) => ucfirst(v) })  //       post.title returns this *function*
  }

  static published(query: Builder<Post>) { /* … */ }        // F-13: scope form unspecified; Post.published() untyped
}
```

**Readability (lens b).** The relationship lines are good. `@hasMany(() => Comment) accessor comments!: Collection<Comment>` is as short as Laravel's method and carries more type information. The `declare` block reads like the `@property` docblock that `ide-helper` writes for Laravel models, so it is familiar. The class only gets hard to read where the spine is silent: the `casts`, accessor and scope forms, and traits. Those gaps are F-01, F-02 and F-13.

### Controller, Form Request, routes

```php
// Laravel
class PostController extends Controller
{
    public function __construct(private SpamChecker $spam) {}

    public function show(Post $post)
    {
        $post->load('comments.author');
        return view('posts.show', compact('post'));
    }

    public function store(StorePostRequest $request)
    {
        $post = $request->user()->posts()->create($request->validated());
        PostCreated::dispatch($post);
        return to_route('posts.show', $post);
    }
}

class StorePostRequest extends FormRequest
{
    public function authorize(): bool { return $this->user()->can('create', Post::class); }
    public function rules(): array
    {
        return ['title' => ['required', 'max:255', Rule::unique('posts')->ignore($this->post)]];
    }
}

Route::get('/posts/{post}', [PostController::class, 'show'])->name('posts.show');
Route::get('/p/{post:slug}', fn (Post $post) => view('posts.show', compact('post')));
```

```ts
// Xaravel as spined
@inject({ spam: SpamChecker })
export class PostController extends Controller {
  constructor(private spam: SpamChecker) { super() }

  @inject({ post: Post })
  async show(post: Post) {
    await post.load('comments.author')
    return view('posts.show', { post })
  }

  @inject({ request: StorePostRequest })
  async store(request: StorePostRequest) {
    const user = await request.user()                       // F-04: user() does IO, so AD-6 makes it async
    const post = await user!.related('posts').create(request.validated())
    await PostCreated.dispatch(post)
    return to_route('posts.show', post)
  }
}

export class StorePostRequest extends FormRequest {
  async authorize() { return (await this.user())!.can('create', Post) }   // F-04, and can() is async (F-16)
  rules() {
    return { title: ['required', 'max:255', Rule.unique('posts').ignore(this.post)] }  // F-02: no magic $this->post
  }
}

Route.get('/posts/{post}', [PostController, 'show']).name('posts.show')
Route.get('/p/{post:slug}', (post: Post) => view('posts.show', { post }))   // F-08: no way to declare `post: Post`
```

### Job, notification, mailable

```ts
// Xaravel as spined — app/Jobs/ProcessPodcast.ts
export class ProcessPodcast extends Queueable(Object) implements ShouldQueue {  // trait shape: F-13
  readonly [ShouldQueue] = true as const        // F-10: instance field; invisible to class-level checks
  tries = 5
  backoff = [10, 60]
  constructor(public podcast: Podcast) { super() }

  middleware() { return [new RateLimited('podcasts')] }   // F-02: Queueable also has a `middleware` *property*

  @inject({ processor: AudioProcessor })
  async handle(processor: AudioProcessor) { await processor.process(this.podcast) }
}

await ProcessPodcast.dispatch(podcast).delay(now().addMinutes(5))  // F-02: Upstream has both $delay and delay()

// app/Mail/OrderShipped.ts
export class OrderShipped extends Mailable implements ShouldQueue {
  readonly [ShouldQueue] = true as const
  constructor(public order: Order) { super() }
  envelope() { return new Envelope({ subject: 'Order Shipped' }) }      // F-17: named args → options object? unstated
  content()  { return new Content({ view: 'mail.orders.shipped' }) }
  attachments() { return [] }                                           // F-02: collides with Mailable's $attachments property
}
```

A job with `@inject` on `handle`, a brand, and constructor property promotion reads acceptably. The brand line is the only foreign-looking element, and generators emit it.

### Provider

```ts
export class AppServiceProvider extends ServiceProvider {
  singletons = [[SpamChecker, AkismetSpamChecker]]     // F-21: Laravel's [A::class => B::class]; shape unspecified

  register(): void {
    this.app.singleton(PaymentGateway, (app) => new StripeGateway(config('services.stripe.secret')))
    this.app.when(PhotoController).needs(Filesystem).give(() => Storage.disk('local'))
    this.app.when(ReportService).needs('$timezone').giveConfig('app.timezone')    // works: AD-4 names
  }

  boot(): void {
    View.share('appName', config('app.name'))          // global base: same as Laravel
    Gate.define('publish', (user: User, post: Post) => user.id === post.user_id)
    RateLimiter.for('api', (request) =>
      Limit.perMinute(60).by(request.user()?.id ?? request.ip()))   // F-04: type error if user() is a Promise
  }
}
```

### Blade view with a fragment

```blade
{{-- Laravel --}}
@extends('layouts.app')
@section('content')
  <h1>{{ $post->title }}</h1>
  @php($count = $post->comments->count())
  @fragment('comments')
    <ul id="comments">
      @foreach ($post->comments as $comment)
        <li>{{ $comment->author->name }} · {{ $comment->created_at->diffForHumans() }}</li>
      @endforeach
    </ul>
    <p>{{ $count }} total</p>
  @endfragment
@endsection
```

```blade
{{-- Xaravel as spined --}}
@extends('layouts.app')
@section('content')
  <h1>{{ post.title }}</h1>                 {{-- or {{ $post.title }}? PORTING.md (F-15) --}}
  @php(const count = post.comments.count())
  @fragment('comments')
    …
    <p>{{ count }} total</p>                {{-- F-15: the fragment fn is called directly, so `count` is not in scope --}}
  @endfragment
@endsection
```

### Feature test

```php
// Laravel
public function test_author_can_publish(): void
{
    Event::fake([PostPublished::class]);
    Queue::fake();
    config(['blog.moderation' => false]);
    $this->app->instance(SpamChecker::class, new FakeSpamChecker);

    $user = User::factory()->create();
    $post = Post::factory()->for($user, 'author')->create();

    $this->actingAs($user)->post("/posts/{$post->id}/publish")
         ->assertRedirect(route('posts.show', $post));

    $this->assertAuthenticatedAs($user);
    Event::assertDispatched(PostPublished::class);
    $this->assertDatabaseHas('posts', ['id' => $post->id, 'status' => 'published']);
}
```

```ts
// Xaravel as spined (test authoring shape is itself unspecified: F-22)
test('author can publish', async function (this: TestCase) {
  Event.fake([PostPublished])
  Queue.fake()
  config({ 'blog.moderation': false })
  this.app.instance(SpamChecker, new FakeSpamChecker())

  const user = await User.factory().create()          // F-09: Database\Factories\UserFactory is not in the Registry
  const post = await Post.factory().for(user, 'author').create()

  ;(await this.actingAs(user).post(`/posts/${post.id}/publish`))   // F-03: the kernel opens a *new* frame here:
    .assertRedirect(route('posts.show', post))         //   fakes, instance(), config and the RefreshDatabase
                                                       //   transaction live in the test frame
  this.assertAuthenticatedAs(user)                     // F-03: auth state set during the request was discarded
  Event.assertDispatched(PostPublished)
  await this.assertDatabaseHas('posts', { id: post.id, status: 'published' })
})
```

---

## Part 2: Findings

### F-01 · Critical · AD-7: field initializers run after the Model constructor

**Laravel**

```php
class Post extends Model
{
    protected $fillable = ['title'];
    protected $attributes = ['status' => 'draft'];
}

$post = new Post(['title' => 'Hi', 'status' => 'published']);
// Model::__construct: bootIfNotBooted → initializeTraits → syncOriginal() (defaults become original) → fill($attributes)
$post->status;            // 'published'
$post->isDirty('status'); // true. Defaults are original, filled values are dirty.
Post::create(['title' => 'Hi']);  // status = 'draft', fillable honoured
```

**Xaravel under AD-7**

```ts
export class Post extends Model {
  fillable = ['title']
  status = 'draft'
}
const post = new Post({ title: 'Hi', status: 'published' })
```

JS order of events:

1. `Model`'s constructor runs and calls `fill({ title, status })`. At that moment `this.fillable` is the base default (`[]`), and `guarded` is `['*']`. So `fill` throws `MassAssignmentException`, or drops everything silently.
2. `Model`'s constructor returns the Proxy.
3. `Post`'s field initializers run: `fillable = ['title']`, then `status = 'draft'`. The `defineProperty` trap now **overwrites** `status` with the default, even though the caller filled `'published'`.

**Problem.** The memlog's reality check confirmed that the trap *intercepts* initializers. It didn't check the *order* relative to work the base constructor does. Every entry point Laravel routes through the constructor is affected: `new Model(attrs)`, `create`, `make`, `firstOrNew`, `firstOrCreate`, `updateOrCreate`, `factory()->make()` and `replicate`. So are `casts`, mutators and `dateFormat`, because `fill` → `setAttribute` needs them.

AD-7 also leaves three related points open:

- **`attributes` is missing from the config-property list.** A developer porting Laravel writes `attributes = { status: 'draft' }`, and that creates an *attribute* named `attributes`.
- **Raw or cast values?** Laravel's `$attributes` holds raw values (`'options' => '[]'`, `'status' => 'draft'`). A typed TS field wants the cast value (`options: Record<string, unknown> = {}`, `status = PostStatus.Draft`). AD-7 doesn't say which one a default holds.
- **`declare` can't carry a default.** `declare status: PostStatus` and `status = …` in one class is "Duplicate identifier". A column with a default therefore can't use `declare`, and AD-7 says typing uses `declare` fields only.

**Suggested fix (keeps AD-7's syntax).**

1. **Harvest a per-class blueprint at boot.** On a class's first construction (the point where Laravel runs `bootIfNotBooted`), `Model` builds one throwaway instance, using `Reflect.construct`, while a synchronous module-internal `harvesting` flag is set. The flag is set and cleared with no `await` in between, so interleaving can't leak it. From that instance, `Model` collects the own-field values and caches them per class:
   - config names → class config;
   - every other name → class defaults.
2. **Use Laravel's order on every later construction.** The base constructor applies the cached config, applies the defaults (converted to raw through the cast's `set`, with **no** mutators, matching `$attributes`), calls `syncOriginal()`, and then calls `fill(args)`. The subclass initializers still run afterwards, but the trap ignores config names and attribute names that are already present.
3. **Require constant-expression defaults.** Field defaults must be constant expressions, which matches PHP's own rule for property defaults. A lint rule enforces it, so `token = Str.random()` is rejected.
4. **Support Laravel's raw form too.** Add `attributes` to the config-property list, so a verbatim port of `attributes = { status: 'draft', options: '[]' }` works.
5. **Amend the typing rule.** "A column with a default is written `status: PostStatus = PostStatus.Draft` (not `declare`). The value is the cast value. Every other column uses `declare`."
6. **Optionally, map Laravel 13's class-level PHP attributes to class decorators.** Check the exact set at v13.37.0 (for example `#[Table]` and `#[Fillable]`, if present). Class decorators run at definition time, so the base constructor sees them without the blueprint step.

---

### F-02 · Critical · AD-7, AD-8, cross-cutting: PHP's two member namespaces collapse into one

PHP keeps properties and methods apart, so `$this->casts` and `$this->casts()` can coexist. Laravel uses this all the time. JS has one namespace per object. AD-8 solves the collision for relationships only. Everywhere else it is unaddressed, and parallel agents will each invent a different fix.

**Laravel (each line is legal PHP)**

```php
// Model
protected $casts = [...];                 protected function casts(): array {...}   // the 11+ stub uses the method
protected $fillable = [...];              $model->fillable(['a']);                  // GuardsAttributes::fillable()
protected $touches = ['post'];            $model->touches('post');                  // HasRelationships::touches()
// column `title` (attribute)              protected function title(): Attribute     // accessor named like the column

// Job (Queueable trait)
public $delay;                            ->delay(now()->addMinute())
public $afterCommit;                      ->afterCommit()
public $middleware = [];                  public function middleware(): array       // app-defined, merged by CallQueuedHandler

// Mailable
public $attachments = [];                 public function attachments(): array      // emitted by the make:mail stub
public $subject; public $from; ...        ->subject('x')->from('a@b')
public $locale;                           ->locale('fr')

// Request / FormRequest
$request->title  /  $this->post          // __get → input or route parameter
$request->user                           // input "user"   …vs…   $request->user()  // authenticated user
```

**Xaravel today.** Each pair needs a choice, and the spine makes none. The worst one is silent. `protected title()` is a prototype member, so AD-7's Proxy passes `post.title` straight through, and the read returns the accessor **function** instead of the attribute. Meanwhile the `declare title: string` that `make:model` emits fails to compile.

**Problem.** These are not edge cases. They appear in:

- every generated User model (`casts()`);
- every generated mailable (`attachments()`);
- every rate-limited job (`middleware()`);
- most accessors on single-word columns (`name`, `title`, `email`, `status`);
- the common FormRequest pattern `Rule::unique(...)->ignore($this->user)`, which sits next to `$this->user()` in `authorize()`.

**Suggested fix.** Add one spine rule, "PHP member namespaces", plus a generated list:

1. **Option pairs that apps override** (`casts`, `middleware`, `backoff`, `tries`, `timeout`, `uniqueId`, `uniqueFor`, `retryUntil`, `attachments`, `envelope`, `content`, `via`, `broadcastOn`, …). There is one JS name. Base classes declare **neither** a field **nor** a method under that name. The framework reads it through `option(this, 'casts')`, which calls the member if it is a function and otherwise returns its value. This mirrors what Upstream already does (`method_exists($job, 'backoff') ? $job->backoff() : $job->backoff`). Both of Laravel's forms then work unchanged.
2. **Framework methods that share a name with framework state** (`delay()`, `afterCommit()`, `fillable()`, `touches()`, Mailable `subject()` / `from()` / `to()` / `cc()` / `locale()` …). The method keeps the public name, and the state moves to internal symbol-keyed storage, read through Upstream's getters (`getFillable()` …). The rare app code that reads or assigns the property directly (`$mailable->subject`, `public $delay = 10`) goes through one new DIV ("PHP member namespaces"), with a test-adaptation rule.
3. **Model accessors** use a decorated auto-accessor, the same idiom as relationships, so models have one idiom for computed members. It typechecks, and the Proxy sees a prototype getter that routes to `getAttribute`:
   ```ts
   @attribute(() => Attribute.make({ get: (v: string) => ucfirst(v), set: (v: string) => v.toLowerCase() }))
   accessor title!: string
   ```
4. **Request magic properties.** There is no `__get` on Request or FormRequest, and `$request->user` vs `user()` can't coexist. Ported code uses `request.input('title')` / `this.route('post')`, which Laravel's docs already use. Record this under the same DIV.
5. **Generate the list.** In Phase 0, scan Upstream at the Pin for every class that has a property and a method with the same name, and commit the list into `PORTING.md` with the rule each pair falls under. This is cheap, mechanical, and removes a whole class of parallel-agent disagreement (priority 2).

---

### F-03 · Critical · AD-5: frame nesting is undefined, which breaks feature tests

**Laravel.** A test is one application. `$this->get()` / `post()` run the kernel *inside that same application*. That is why all of the following work:

```php
Event::fake();  $this->app->instance(X::class, $fake);  config(['a' => 1]);   // seen by the request
$this->post('/login', [...]);  $this->assertAuthenticated();                // reads the guard after the request
$this->post('/cart', [...])->assertSessionHas('cart');                      // reads app('session.store') afterwards
$this->post('/login', [...]);  $this->get('/dashboard')->assertOk();        // the guard persists across requests
use RefreshDatabase;  // one open transaction; the request's queries run inside it
```

**Xaravel as worded.** AD-5 says: "The HTTP kernel … and the test harness each open exactly one frame per unit of work", and "A frame is discarded when its unit ends". It doesn't say whether a frame opened while another is active is a *child* (reads fall through to the parent) or a *sibling* over the global base. If it is a sibling, every line above fails:

- the request can't see the test's fakes, instances or config;
- the auth and session state written during the request is discarded before `assertAuthenticated()` runs;
- on Postgres, the request's queries go to a different pooled `Bun.sql` connection from the one holding the RefreshDatabase transaction, so rows the test created are invisible.

**Problem.** This is the core of FR-96 to FR-99 and of almost every Laravel feature test. The same question comes up for the `sync` queue driver (does a job dispatched in a request see the request's frame?), for `this.artisan()` in tests, and for `Bus.dispatchSync()`.

**Suggested fix.** Add to AD-5:

- **Frames nest.** A frame opened inside another is a child. Reads go child → parent → … → base.
- **There are two kinds of frame.** *Unit* frames are opened for a request, job, command, scheduled task or test. *Narrow* frames (see F-05) carry only named slots. A write goes to the innermost **unit** frame, unless its slot is owned by a narrow frame.
- **Embedded kernel mode for tests.** `this.get()` / `this.artisan()` / the `sync` driver run with an embedded kernel. The request gets a narrow child frame holding only request-bound slots (current request, route, CSP nonce). Auth, session, config, `instance()` and Context land in the test's unit frame. This reproduces Laravel's one-app-per-test semantics exactly. Tests await their requests one after another, so nothing interleaves.
- **Transactions are visible across the boundary.** The test frame's open transaction (its reserved connection) is visible to embedded requests.
- **Add an NFR-4 test.** Two *tests* running concurrently with embedded requests don't see each other.

---

### F-04 · High · AD-6: `request.user()` becomes async

**Laravel**

```php
$request->user()->posts()->create($data);
if (auth()->check()) { … }
Auth::id();
@auth … @endauth                          // in every layout
Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
$posts->filter(fn ($p) => $request->user()->can('view', $p));
```

**Xaravel under AD-6.** `SessionGuard::user()` loads the user through the provider, which is DB IO. In Upstream, `check()`, `guest()` and `id()` all call `user()`. So "returns a Promise iff it transitively calls an async Driver-contract method" makes all of them async:

```ts
const user = await request.user()
await user!.related('posts').create(data)
if (await auth().check()) { … }
Limit.perMinute(60).by((await request.user())?.id ?? request.ip())   // the limiter callback must now be async
```

**Problem.** DIV-1 lists what stays sync: session after `StartSession`, request input, and so on. The authenticated user is not on the list, so this regression is not one of the DIV-1 differences that §5.1 allows. Nothing in DIV-1 requires it either: the PRD already uses "loaded once before the pipeline" for the session and for the request body. `user()` is called in most controllers, most policies, every authenticated layout and most `FormRequest::authorize()` methods.

**Suggested fix.** Extend AD-6's sync list with "guard state after resolution":

- A framework step in the `web` and `api` groups, after `StartSession` (the slot `AuthenticateSession` uses), resolves the default guard's user once. That is zero queries for guests and one when a session login id is present. Laravel already pays that query on the first `user()`.
- The `auth:<guard>` middleware resolves its own guard.
- After resolution, `user()`, `check()`, `guest()`, `id()`, `request.user()`, `auth().user()` and `Auth.user()` are sync.
- Reading a guard that was never resolved (in console, or a non-default guard with no middleware) throws a named exception, in the spirit of Strict Loading, and points to `await Auth.guard('x').authenticate()`. Record this as a DIV-1 note.

---

### F-05 · High · AD-5: the `DB.transaction()` child frame swallows writes

**Laravel**

```php
DB::transaction(function () use ($data) {
    $user = User::create($data);
    Auth::login($user);                  // must still be logged in after commit
    Context::add('user_id', $user->id);
    App::setLocale($user->locale);
});
```

**Xaravel under AD-5.** "`DB.transaction()` opens a child frame." Writes inside a frame go to that frame's overlay, and the frame is discarded when its unit ends. Auth guard state, Context and locale are listed as frame-owned. So after the callback returns, the user is **not** logged in, the Context entry is gone, and the locale is back to its old value. No error is raised. The registration flow above is the canonical case.

**Suggested fix.** Make the transaction frame a *narrow* frame (F-03). It owns only the connection/transaction-stack slot. Every other read and write passes through to the enclosing unit frame. State this explicitly next to the "Concurrency tests" sentence, and add a Xaravel Test: `Auth.login` inside `DB.transaction` survives the commit.

---

### F-06 · High · AD-5: boot-once-per-process vs Laravel's app-per-test lifecycle

**Laravel.** `TestCase::setUp()` → `refreshApplication()` → `createApplication()` creates a **fresh application for every test**. Public testing API depends on it:

- `afterApplicationCreated`, `beforeApplicationDestroyed` and `refreshApplication()`;
- Testbench's `defineEnvironment($app)`, `getPackageProviders()`, `#[WithConfig]`, `#[WithEnv]` and `#[DefineEnvironment]`, which vary per test class or per test and must run **before** providers register and boot;
- provider code that reads config at `register` time (for example "bind driver X if `config('services.x.enabled')`").

**Xaravel under AD-5.** "The application boots once per process and is shared. Each … test runs inside a Scope Frame." A test that sets config in its frame *after* boot can't influence `register()`. Different `getPackageProviders()` per test class can't work at all. FR-101 promises the `WithConfig` / `WithEnv` equivalents.

**Suggested fix.** Make the **Application instance**, not the process, the unit that boots once, and attach frames to their app. Production HTTP and workers keep one app per process, which is right. The test harness creates a fresh app per test by default, matching Laravel. It offers a documented opt-in shared-app mode for speed, for suites that don't vary config before boot. Facades resolve `frame.app`. That is Laravel's `Facade::setFacadeApplication`, made frame-aware.

---

### F-07 · High · AD-1: "tokens, never strings" removes string abstracts

**Laravel**

```php
app('cache')->get('k');            resolve('view');            $app['config']['app.name'];
$this->app->singleton('reports.exporter', fn () => new CsvExporter);
app('reports.exporter');
protected static function getFacadeAccessor() { return 'reports.exporter'; }   // custom facades
$this->app->alias(Exporter::class, 'exporter');
```

**Xaravel under AD-1.** "The container binds and resolves tokens, never strings." Read literally, every line above is impossible:

- `Application::registerCoreContainerAliases()` (`'cache'`, `'db'`, `'view'`, `'auth'` …) can't be ported;
- custom facades in app and package code must invent token exports;
- a large share of the Container Component's Ported Tests use string abstracts (`$container->bind('foo', …)`) and would need Escalations.

**Problem.** The rule exists to stop the *framework* from wiring contracts by magic strings, which is a good goal. It is worded as a public API restriction, which §5.1 doesn't allow.

**Suggested fix.** Reword it: "Framework code binds and resolves **contracts** through their tokens. The container's public API accepts `string | Token | class` abstracts exactly as Upstream does, including `alias()` and the core alias table (ported verbatim, mapping strings to tokens)." Keep the `import type` lint. Also specify how an app or package declares a token for its *own* interface, because Laravel devs bind interfaces daily (`bind(PaymentGateway::class, StripeGateway::class)`):

```ts
// emitted by make:interface
export interface PaymentGateway { charge(amount: number): Promise<Receipt> }
export const PaymentGateway = contract<PaymentGateway>('App\\Contracts\\PaymentGateway')  // FQCN = Registry key (AD-10)
```

Abstract classes work as tokens with no helper. Say so in the docs.

---

### F-08 · High · AD-4: closures can't inject, and contextual attributes are missing

**Laravel**

```php
Route::get('/p/{post:slug}', fn (Post $post) => view('posts.show', compact('post')));
Route::post('/upload', function (Request $request, Filesystem $files) { … });
Artisan::command('mail:send {user}', function (DripEmailer $drip, string $user) { … });
app()->call(fn (Mailer $mailer) => $mailer->raw('hi', …));
Schedule::call(function (ReportService $reports) { … })->daily();
Event::listen(function (PodcastProcessed $event) { … });                      // event inferred from the type hint

// Laravel 11+/12 contextual attributes (Illuminate\Container\Attributes\*)
public function __construct(
    #[Config('app.timezone')] protected string $tz,
    #[CurrentUser] protected User $user,
    #[Storage('s3')] protected Filesystem $disk,
    #[Tag('reports')] protected iterable $reports,
    #[RouteParameter('post')] protected Post $post,
) {}
```

**Xaravel under AD-4.** "The only declaration form is the … decorator … placed on a class or on a method." Standard decorators can't be applied to arrow functions or function expressions. So closure routes get no model binding and no DI, and the same goes for closure commands, scheduled closures and `app.call(fn)`. Laravel's docs open the routing and binding chapters with closure examples. The map's values are "Tokens" and "`primitive`". There is no slot for `#[Config]`, `#[CurrentUser]`, `#[Storage]`, `#[Tag]`, `#[Give]`, `#[DB]`, `#[Cache]`, `#[Log]` or `#[RouteParameter]`.

**Suggested fix (still one declaration shape).**

```ts
// 1. Function form. It writes the same metadata to the function (a symbol property); the container reads either.
Route.get('/p/{post:slug}', inject({ post: Post }, (post: Post) => view('posts.show', { post })))
Artisan.command('mail:send {user}', inject({ drip: DripEmailer, user: primitive }, async (drip, user) => { … }))

// 2. Map values may be contextual-attribute descriptors from @xaravel/framework/container/attributes
@inject({ tz: Config('app.timezone'), user: CurrentUser(), disk: Storage('s3'), reports: Tag('reports') })
export class ReportController { constructor(private tz: string, private user: User, private disk: Filesystem, private reports: Report[]) {} }
```

`Event.listen(closure)` without an event class needs `Event.listen(PodcastProcessed, (e) => …)`. That two-argument form is Laravel's own. Document the closure-only form as an adaptation under DIV-3.

---

### F-09 · High · AD-10: the PSR-4 map and convention directories are too narrow

**Laravel.** `composer.json` autoloads three roots: `App\` → `app/`, `Database\Factories\` → `database/factories/`, and `Database\Seeders\` → `database/seeders/`. The framework resolves classes **by name** in many places:

| Upstream lookup | Resolves | In AD-10's dir list? |
| --- | --- | --- |
| `HasFactory::newFactory()` / `Factory::resolveFactoryName()` | `Database\Factories\UserFactory` | No (not even a PSR-4 root) |
| `Factory::modelName()` | `App\Models\User` from the factory's name | Yes |
| `db:seed --class=UserSeeder`, `DatabaseSeeder::call()` | `Database\Seeders\UserSeeder` | No |
| `<x-forms.input>` → `ComponentTagCompiler::componentClass()` | `App\View\Components\Forms\Input` | No |
| `route:cache` (`uses` stored as `App\Http\Controllers\X@show`), middleware aliases | `App\Http\Controllers\*`, `App\Http\Middleware\*` | No |
| Queue payloads carrying enums or value objects from `app/Enums`, `app/Data` … | any `App\…` | No |
| Events and listeners in domain folders (`app/Domain/Billing/Events`) | any `App\…` | No |

**Xaravel under AD-10.** The map is `<root>/app → App\`, and boot imports nine fixed directories. So `User.factory()` fails in every test, `db:seed --class` fails, class-based Blade components (FR-45) fail, and `route:cache` can't rehydrate controllers. Each failure is loud, which is good (FR-22), but it is a failure.

**Suggested fix.** Take the PSR-4 map from the Skeleton's `package.json`, mirroring Composer:

```json
"xaravel": { "autoload": { "psr-4": { "App\\": "app/", "Database\\Factories\\": "database/factories/", "Database\\Seeders\\": "database/seeders/" } } }
```

- At boot, eagerly import only the DIV-7 discovery directories, as today.
- On a Registry miss in an async resolution path, which covers queue deserialization, `db:seed`, the component compiler and `route:cache` loading, resolve the FQCN to a file through the PSR-4 map and `await import()` it. These are Composer autoload semantics.
- `optimize` writes the full classmap over all roots.
- A miss that the map can't resolve still throws the FR-22 error.

---

### F-10 · High · AD-9 × AD-7: instance-field marker brands

**Laravel**

```php
class User extends Authenticatable implements MustVerifyEmail { … }
class SendShipmentNotification implements ShouldQueue { public function handle(OrderShipped $e) { … } }
// Dispatcher::handlerShouldBeQueued() checks the *class* via reflection, without instantiating the listener
```

**Xaravel under AD-9**

```ts
export class User extends Authenticatable implements MustVerifyEmail {
  readonly [MustVerifyEmail] = true as const    // a class field initializer…
}
```

**Problems.**

1. **On a Model**, the field initializer hits AD-7's `defineProperty` trap. AD-7 doesn't exclude symbol keys, so the brand becomes an attribute default. Depending on the agent, `save()` then fails, or `toArray()` / `isDirty()` behave oddly. `MustVerifyEmail`, `HasLocalePreference`, `CanResetPassword` and the `Authenticatable` contracts all sit on models.
2. **Class-level checks.** Laravel decides queued-ness for listeners and subscribers, uniqueness (`ShouldBeUnique`), and `ShouldDispatchAfterCommit` / `ShouldHandleEventsAfterCommit` from the **class**, often before or without building an instance. Instantiating would run DI and constructor side effects. An instance field is not visible on the class or its prototype.

**Suggested fix.** Keep "one declaration" but put the brand on the prototype. A getter satisfies `readonly [X]: true` in TS:

```ts
export class SendShipmentNotification implements ShouldQueue {
  get [ShouldQueue]() { return true as const }   // prototype member: visible as Klass.prototype[ShouldQueue]
}
```

- Runtime checks read `Klass.prototype[Token] === true`, which also works for instances.
- Add to AD-7: "symbol-keyed members are never attributes".
- Generators emit the getter form, so developers rarely type it.

---

### F-11 · High · AD-9: BIGINT overflow vs the `'bigint'` cast

**Laravel (64-bit PHP)**

```php
DB::table('discord_users')->get();          // snowflake IDs > 2^53 come back as int
return User::find($id);                     // JSON: {"discord_id": 1234567890123456789}
```

**Xaravel under AD-9.** "The Connection returns a `number` when the value is within ±`MAX_SAFE_INTEGER`, and otherwise throws `IntegerOverflowException`. A column cast `'bigint'` always yields `bigint`."

**Problems.**

1. **Order.** The Connection normalises the row *before* Eloquent hydrates it and applies casts. So a model with `casts: { discord_id: 'bigint' }` still throws on the read, and the cast never gets to apply. The two sentences contradict each other.
2. **Query-builder users** (`DB.table()`, `DB.select()`, aggregates, `pluck`) have no opt-in at all.
3. **Serialization.** `JSON.stringify` throws `TypeError` on a `bigint`. So `return user` from a controller, `toJSON()`, `json` casts and queue payloads crash for any model that uses the cast.

**Suggested fix.**

- Drivers hand raw values (lossless) to the Connection. The Connection converts in-range values to `number`.
- For out-of-range values, the Connection keeps a `bigint` when the column is declared lossless, and otherwise throws. A column is declared lossless when either:
  - Eloquent passes its `'bigint'`-cast column names down to hydration; or
  - the connection's config sets `integers: 'bigint'`. This is a config key, not a new method, so there is no API divergence.
- The framework's JSON encoder (`toJson`, responses, payloads) writes a `bigint` as JSON number text with its exact digits, which matches `json_encode` and can be diffed against the Oracle.

---

### F-12 · High · AD-14: what a queued closure can reference

**Laravel**

```php
dispatch(function () use ($user) {
    Mail::to($user)->send(new WelcomeMail($user));
    Log::info('sent', ['id' => $user->id]);
});
```

**Xaravel under AD-14.** At dispatch, the codec "rejects any free identifier that is not a parameter or an ECMAScript standard built-in". `Mail`, `Log`, `WelcomeMail`, `now` and `config` are all free identifiers, so the closure is rejected. On the worker, the rebuilt function "has access only to its arguments and the Class Registry", but nothing says *how* closure source names a Registry class. The two halves don't line up. The only form that passes today is:

```ts
await dispatch(async ({ user, Mail, Log, WelcomeMail }) => { … }, { user, Mail, Log, WelcomeMail })
```

and AD-14 doesn't say whether facade classes are even serializable arguments.

**Suggested fix.** State the allowed free identifiers:

- **(a) Framework facades and global helpers, by their Upstream names.** The worker binds them to its app. A frozen list is generated from `@xaravel/framework/support/facades` plus the helper module (F-18).
- **(b) Everything else** (app classes, models, local variables) must be an argument. Classes serialize by Registry FQCN. Models serialize as `ModelIdentifier`, as `SerializesModels` does.

The dispatch-time error names the identifier and shows the rewrite. The developer then writes:

```ts
await dispatch(async ({ user, WelcomeMail }) => {
  await Mail.to(user).send(new WelcomeMail(user))
  Log.info('sent', { id: user.id })
}, { user, WelcomeMail })
```

The same rules apply to `Bus.chain` / `Bus.batch` callbacks and `Concurrency.run`.

---

### F-13 · Medium · AD-7, AD-8: model idioms the spine leaves open

AD-7 says it prevents "competing attribute-storage schemes across Eloquent Epics". The idioms below live on the same class, are just as visible, and are deferred to one-liners or not mentioned at all:

| Laravel | Open question | Suggested binding form |
| --- | --- | --- |
| `protected function title(): Attribute` | collision (F-02) | `@attribute(() => Attribute.make({...})) accessor title!: string` |
| `scopePublished(Builder $q)` / `#[Scope]` → `Post::published()` and `$q->published()` | how `Post.published()` exists and is typed | `@scope static published(query: Builder<Post>) {…}`. The decorator replaces the static with `(...a) => Post.query().published(...a)`. `Builder<M>` gains typed scope methods through a mapped type over the class's `@scope` statics |
| `use HasFactory, SoftDeletes, Notifiable` | mixin shape, `boot<Trait>` / `initialize<Trait>`, **trait-defined relationships** (`Notifiable` → `notifications`, `unreadNotifications`) | one mixin form, for example `class User extends Model.with(HasFactory, Notifiable)`. Mixins may carry accessor-decorated relationships |
| `withCount('posts')` → `$user->posts_count` | `posts_count` is untyped and is a TS error on read | `withCount<K extends string>(k: K): Builder<M & { [P in \`${K}_count\`]: number }>`. Do the same for `withSum` / `withExists` |
| `#[ObservedBy]`, `#[ScopedBy]`, `#[UseFactory]`, `#[CollectedBy]`, `#[UsePolicy]`, Laravel 13 class attributes (check at Pin) | not mentioned | PHP class attribute → TS class decorator with the same name and arguments (`@ObservedBy([PostObserver])`). This is the most natural TS mapping in the whole port. Make it a spine convention |

**Suggested fix.** Add a short AD-7b "Model definition idioms" table to the spine, or make `PORTING.md`'s Eloquent section a Protected precondition of the first Eloquent Epic. Moving trait mechanics from "Deferred, one line each" into that table matters most, because `User` uses three traits on day one.

---

### F-14 · Medium · AD-8: relationship-definition details

**Laravel**

```php
public function latestComment(): HasOne { return $this->comments()->one()->latestOfMany(); }   // reuses another relation
public function deployments() { return $this->through('environments')->has('deployments'); }  // through() by relation name
public function roles() { return $this->belongsToMany(Role::class)->using(RoleUser::class)->withPivot('active')->as('membership'); }
User::resolveRelationUsing('orders', fn ($user) => $user->hasMany(Order::class));               // packages add relations
$post->author()->associate($user);   // sets the relation on $post (setRelation)
```

**Problems with AD-8's wording.**

- **What the callback gets.** "The optional second argument constrains the query." It must receive the **Relation** (for `withPivot`, `using`, `as`, `withDefault`, `latestOfMany`, `chaperone`, `wherePivot`), and it must be allowed to **return a different Relation** (`one()`, `ofMany`). Otherwise `latestComment` and similar definitions can't be expressed.
- **`through('environments')->has('deployments')`** (Laravel 10+) refers to other relationships by name. Under AD-8 that means `related()` inside the definition, which the thunk-and-callback form doesn't offer.
- **"Defined only as a decorated auto-accessor"** rules out `resolveRelationUsing`, which is public API that packages use. Carve it out: the Proxy routes a read of a resolver-defined name to the relation value, and `related(name)` works.
- **"Any chained call returns a query that never caches"** is about query building. Relation *mutators* (`associate`, `dissociate`, `attach`, `sync`, `toggle`, `save`, `create`) keep Upstream's side effects. `associate` must still `setRelation`. Say so, or an agent will follow the wording literally.
- **Typing.** `related('posts')` takes a string. Type it as `related<K extends RelationKeys<this>>(k: K): RelationOf<this, K>`. Have the relationship decorators brand the accessor type with a phantom (`Collection<Post> & { [rel]?: HasMany<Post, this> }`), so that `related('author').associate(u)` is typed as `BelongsTo` and `related('typo')` is a compile error. Use the same keys for `with()` / `load()` / `whereHas()`.
- **Name guessing.** Upstream guesses `belongsTo` and `morphTo` keys from the *method name* through a backtrace. The decorators must use `context.name` for this. It is worth one line, so agents don't reinvent it.
- **PRD wording.** §5.1 and FR-63 say `await model.relation('posts')`, and the spine says `related()`. "Source Amendments Required" doesn't list FR-63 or §5.1. Add them, or agents working from the PRD will implement `relation()`.

---

### F-15 · Medium · AD-11: Blade variable scope, fragments and directives

**Problem 1: variable scope.** View data keys are known only at render time (`view('x', $data)`, `View.share`, composers, `$errors`). Compiled modules are strict ESM, so `with (data) {}` is unavailable. The compiler must therefore either rewrite free identifiers to `$data.x`, which needs a TS identifier pass that `Bun.Transpiler` doesn't provide, or specialise modules per key set. Each choice changes behaviour:

- `@isset($maybeUndefined)` / `@empty` must not throw on an undeclared variable, which a bare `typeof x` handles but `x !== undefined` doesn't;
- PHP's "Undefined variable" error is an `ErrorException` and must map consistently.

**Problem 2: the `$` sigil.** Should `{{ $post->title }}` become `{{ $post.title }}` or `{{ post.title }}`? `$post` is a legal JS identifier. Keeping the sigil keeps `$loop`, `$errors`, `$slot`, `$attributes` and `$component` under their Laravel names. It makes templates look like Blade, and it makes FR-48's mechanical translation simpler. Recommend keeping `$`, and fix this in AD-11 rather than leaving it to `PORTING.md`.

**Problem 3: fragments.** AD-11 calls the fragment function directly. Laravel renders the whole view and extracts the fragment. In the slice in Part 1, `@php(const count = …)` sits before `@fragment`, so with a direct call `count` is not in scope, and the result is a `ReferenceError` at request time for htmx Requests only. The same applies to `@section`- or `@foreach`-dependent state.

Fix: the compiler knows each fragment's free identifiers. If any of them is a template local defined outside the fragment, either (a) raise a **compile-time** `ViewException` that names the variable (preferred: loud and cheap), or (b) fall back to a full render with emission switched off outside the fragment. Direct calls stay the fast path for the common case.

**Problem 4: the custom-directive ABI.** `Blade::directive('datetime', fn ($e) => "<?php echo ($e)->format('m/d/Y H:i'); ?>")` returns *code*. Xaravel's directive handlers return TS, so the emitted-code helpers (`echo`, `e`, `$__env`, the stack/section API) are public contract and must be fixed once. `Blade::if` and `Blade::stringable` depend on them too.

---

### F-16 · Medium · AD-6: async classification at the root, and app-code thenables

1. **Circular at the root.** AD-6 derives the async-ness of the app surface from "async Driver-contract methods", but never says how a *contract* method is classified. If the Filesystem contract is made async across the board, `Storage.url()` becomes async. That breaks a very common model accessor:
   ```php
   protected function avatarUrl(): Attribute { return Attribute::get(fn () => Storage::url($this->avatar_path)); }
   ```
   Accessors are sync. Fix: "a contract method is async iff at least one Upstream driver performs IO in it". Then `url`, `path`, S3 `temporaryUrl` (presigning is local), cache `getPrefix` and so on stay sync. List those examples in AD-6.
2. **Async Gate → predicate companions.** Policies may be async (DIV-1), so `can()` / `Gate.allows()` return Promises, and `$posts->filter(fn ($p) => $user->can('view', $p))` no longer ports. AD-6 names only `eachAsync` / `mapAsync`. Add `filterAsync`, `rejectAsync`, `firstAsync`, `everyAsync`, `containsAsync` and `partitionAsync`, or a documented `await posts.mapAsync(...)` + `filter` recipe.
3. **"An async callback is a type error" is not true in TS.** `() => Promise<void>` is assignable to `() => void`, and `map<U>` infers `U = Promise<…>`. It is caught by `no-misused-promises` (lint), or by overloads with `U extends PromiseLike<any> ? never : U`. Say "lint or type error", and require the overloads on the most common methods (`map`, `each`, `filter`, `reduce`, `sortBy`).
4. **Builders returned from `async` app functions run silently.**
   ```ts
   async function activeUsers() { return User.where('active', 1) }   // returns Promise<Collection>, not a builder
   ```
   AD-6 forbids this in framework code only. App developers often write helpers that return builders (repositories, filters, DataTable `query()` methods). Add a lint rule, "thenable returned from async function", to the Skeleton's oxlint config, and explain it in the DIV-1 docs.

---

### F-17 · Medium · cross-cutting: PHP named arguments

**Laravel 9+ APIs are built around named arguments.**

```php
new Envelope(subject: 'Order Shipped', from: new Address('a@b', 'Shop'));
new Content(view: 'mail.orders.shipped', with: ['total' => $t]);
Attribute::make(get: fn ($v) => ucfirst($v), set: fn ($v) => strtolower($v));
Attachment::fromStorage('/x.pdf')->as('invoice.pdf');
$users->paginate(perPage: 20, pageName: 'u');
```

**Xaravel.** Neither the spine nor the addendum's mapping table says how these map. Positional calls with `undefined` placeholders (`new Envelope(undefined, undefined, undefined, undefined, 'Order Shipped')`) obey §5.1 to the letter and are unusable in practice. Each Component agent will invent its own options-object shape.

**Suggested fix.** Add a Consistency Convention:

- Every public function or constructor whose Upstream signature has more than one optional parameter also accepts, as its **only** argument, an options object whose keys are the PHP parameter names in camelCase.
- Positional calls stay valid.
- Constructors whose Upstream docs use only named arguments (`Envelope`, `Content`, `Attribute::make`, `Headers`) put the object form first in their typings and docs.

Add a row to the addendum table: `new Envelope(subject: 'x')` → `new Envelope({ subject: 'x' })`.

---

### F-18 · Medium · AD-3: helpers, Blade scope, default exports

- **Helpers.** AD-3 covers *classes* and facades. `config`, `app`, `view`, `route`, `redirect`, `to_route`, `now`, `collect`, `__`, `abort`, `old`, `csrf_token`, `dispatch` and `event` are global in PHP. The spine doesn't say whether they are imported (and from which subpath) or installed on `globalThis` with `declare global` typings. Every generated file depends on the answer. Recommend importing from one subpath, `@xaravel/framework/helpers`, which generators emit. Blade templates, `tinker` (FR-73) and queued closures (F-12) get the full helper set in scope automatically.
- **Decorator homes.** `inject`, `primitive`, `hasMany` and the other relationship decorators, plus `attribute` and `scope`, are functions, not classes. Fix their subpaths: `@xaravel/framework/container` and `@xaravel/framework/database/eloquent/relations`.
- **Default exports.** "No default exports" is right for packages. App files in Laravel *return* values: `config/app.php` does `return [...]`, and an anonymous migration does `return new class extends Migration`. The natural TS form for both is `export default`. Scope the AD-3 rule to package public API, and state the Skeleton's forms: `config/*.ts` → `export default { … }`, `database/migrations/*.ts` → `export default class extends Migration { … }`.

---

### F-19 · Medium · AD-4: decorator ergonomics

```php
public function show(Request $request, string $id, int $page = 1) { … }      // Laravel
public function show(Request $request, UserProfile $userProfile) { … }      // binds route {user_profile}
```

```ts
@inject({ request: Request, id: primitive, page: primitive })   // Xaravel as spined
async show(request: Request, id: string, page = 1) { … }
```

1. **Drift.** Nothing checks that the map's keys and order match the parameter list, or that each token matches the annotated type. A renamed parameter silently changes route binding. Fix: type `inject` so that the method's parameter types must be a permutation of the tokens' instance types (a set check is feasible in TS), and add an oxlint JS-plugin rule that checks key names and order against the parameter names.
2. **`primitive` is noise, and it loses PHP coercion.** PHP coerces route strings into `int $page`. Accept `String`, `Number` and `Boolean` as tokens that coerce with PHP's rules (`@inject({ id: String, page: Number })`). That reads like a PHP type hint and keeps the behaviour. Keep `primitive` as the untyped alias.
3. **Default when there is no decorator.** State that an action without `@inject` receives route parameters positionally, which is Upstream's behaviour for parameters without a type hint. Then simple actions need no decorator.
4. **snake/camel.** Upstream's implicit binding matches `$userProfile` to `{user_profile}` (`Str::snake`). Port this explicitly.
5. **Listener discovery (DIV-7).** Laravel discovers which event a listener handles from the `handle()` type hint. State that discovery reads the first key of `handle`'s `@inject` metadata (and `__invoke`'s), so `@inject({ event: OrderShipped }) handle(event)` registers the listener with no second declaration. Union types become several tokens via `oneOf(A, B)`.
6. **Invokables.** Keep `__invoke` as the method name for single-action controllers, invokable listeners and jobs, so `Route.post('/x', ProvisionServer)` maps 1:1.

---

### F-20 · Medium · AD-5: static configuration APIs and singleton placement

1. **Configure-once statics.** Laravel apps call many static "configure" APIs, in `AppServiceProvider::boot()` and in tests:

   ```php
   Model::unguard();          Model::shouldBeStrict();      JsonResource::withoutWrapping();
   Str::createUuidsUsing(…);  Password::defaults(…);        Paginator::useBootstrapFive();
   ResetPassword::createUrlUsing(…);  VerifyEmail::toMailUsing(…);  Vite::useCspNonce();
   ```

   The spine's state convention says static mutable fields fail lint "unless listed as boot-only". Many of these are also called in tests (`Str::createUuidsUsing` in a test, `Model::unguard()` in a seeder run from a test). If they are boot-only globals, concurrent tests leak into each other. Fix: one helper, for example `frameStatic(Class, 'key')`, for every Upstream static setter. Writes at boot go to the base, writes in a frame go to the overlay. Reserve the "boot-only" list for framework-internal caches. `Event.fake()` must also swap the Model event dispatcher (`Model::setEventDispatcher`) inside the frame, as Upstream does.
2. **Singleton resolution.** When a `singleton` bound at boot is first resolved *inside* a request frame, is the instance cached in the base or in the overlay? AD-5's "writes inside a frame go to the overlay" suggests the overlay, and that would quietly turn every singleton into a scoped binding: managers re-created per request, lost connections. State that the instance is cached at the level where the binding was registered. Then adopt Octane's known guard: a base-level singleton whose construction resolves a scoped or frame-owned binding (`Request`, session, auth) raises a dev-mode error, because otherwise request 1 leaks into request 2.

---

### F-21 · Medium · AD-1, AD-10: class-keyed maps and class references in config

**Laravel**

```php
public $singletons = [ServerProvider::class => DigitalOceanServerProvider::class];
protected $policies = [Post::class => PostPolicy::class];
protected $listen   = [OrderShipped::class => [SendShipmentNotification::class]];
// config/auth.php
'providers' => ['users' => ['driver' => 'eloquent', 'model' => App\Models\User::class]],
```

**Xaravel.**

- **Object keys.** A JS object literal can't use a class as a key. `{ [Post]: PostPolicy }` stringifies the class source. Tokens that are symbols work as keys, but classes don't, so these maps need a specified shape.
- **Config files and `config:cache`.** Laravel uses `::class` strings, so config never imports app code. If `config/auth.ts` imports `User`, the config files pull in the database package and the models at config-load time. `config:cache` (FR-20) also can't serialize a class to its cache file, so after caching, `config('auth.providers.users.model')` would return a different kind of value than before.

**Suggested fix.**

- For class-keyed maps, accept an array of pairs (`[[Post, PostPolicy]]`) or a `Map`, and document one form for generators.
- In config, allow class references *or* FQCN strings. `config:cache` writes a class as `{ "$class": "App\\Models\\User" }` and rehydrates it through the Registry, so `config()` returns a class whether or not the config is cached.

---

### F-22 · Medium · AD-5, FR-96: the app test authoring shape

FR-96 promises `await this.get('/invoices')`, but `bun:test` doesn't bind `this` for test callbacks. An arrow function (`async () => { await this.get('/') }`) has a module-level `this`, which is `undefined` in ESM. That makes it the most likely first-day error. Laravel 13 ships PHPUnit classes by default, with Pest as an option. The spine fixes the Ported-Test wrapper (AD-15) but not the app-facing form, and the Testing and Testbench Epics will need it.

Laravel's fluent chain also degrades: `$this->post(...)->assertRedirect()->assertSessionHas('ok')` becomes `(await this.post(...)).assertRedirect().assertSessionHas('ok')`.

**Suggested fix.**

- Decide on a Pest-like form: `uses(TestCase, RefreshDatabase)` plus `test(name, async function () {…})`, with `this` bound and typed, plus a lint rule that rejects arrow functions in `test()` when the file calls `uses()`. Optionally also support a class form.
- Make the HTTP test call return a `PendingTestResponse`. It is thenable (resolving to a `TestResponse`), and its `assert*` methods queue up and run once the response arrives. Then `await this.post(url, data).assertRedirect(route('x')).assertSessionHas('ok')` keeps Laravel's one-line fluent style.

---

### F-23 · Low · AD-8: a meaning for `automaticallyEagerLoadRelationships()`

Laravel 12.8's feature is mainly useful because of its *collection-wide* batching: touching a relation on one model loads it for every model in the originating collection. Under AD-8, a Xaravel meaning would be: when it is enabled, awaiting an unchained `related(name)` on a model that came from a collection eager-loads `name` for the whole collection. One query, not N. This keeps "reads are sync" intact and gives the Escalation a concrete proposal.

Also decide what `handleLazyLoadingViolationUsing(fn)` does. Upstream calls the handler and then *lazy-loads anyway*. A sync read can't do that, so the handler runs and the read throws or returns `null`. Pick one, and add it to DIV-2's Record.

---

### F-24 · Low · AD-7: the Proxy surface developers will touch

- **Spreading and keys.** `{ ...post }`, `Object.keys(post)` and `structuredClone(post)` are common JS reflexes. Define an `ownKeys` / `getOwnPropertyDescriptor` behaviour, for example "attributes only", or document that `toArray()` is the only supported way.
- **`#private`.** Framework `Model` code must not use `#private` fields. They sit on the target while `this` is the Proxy, so access throws `TypeError`. App subclasses can use `#private` only if the `get` trap never binds methods to the target. State both rules.
- **Assigning to a relationship accessor.** What does `post.author = user` (the accessor's setter) do? Laravel's equivalent `$post->author = $user` silently sets a bogus attribute. Recommend `setRelation` semantics, or throwing. Either beats silence.

---

### F-25 · Low · AD-13: one job per child

The spine doesn't say whether the worker child runs jobs concurrently. If it does, a `--timeout` kill also takes in-flight sibling jobs and counts attempts against them. Laravel's worker runs one job at a time. State "one job at a time per child" (parity), and if concurrency is ever wanted, add it as a separate Xaravel option.

---

### F-26 · Low · AD-11: views as strings

`(string) view('x')`, `echo view('x')` and `{!! view('partials.x') !!}` work in Laravel because `View::__toString()` renders synchronously. Rendering in Xaravel is async. `View#toString()` should throw a `ViewException` naming `await view(…).render()`, so a template literal doesn't print `[object Object]` or a Promise. Inside Blade, `{!! view(…) !!}` can be awaited automatically by the compiler.

---

### F-27 · Low · AD-2, AD-12: packaging notes

- **AD-2.** Optional `peerDependencies` reached through `import()` are invisible to app developers only if `@xaravel/framework` (what the Skeleton depends on) lists every one of them as a real dependency. State this, or `CACHE_STORE=redis` fails at runtime with a module-not-found error.
- **AD-12.** The seams are Laravel's own idiom (macros, renderables, decorators), and non-htmx requests stay Upstream. The only gap: TS module augmentation applies only if `@xaravel/htmx` is in the type program. The Skeleton should import it (for example `bootstrap/providers.ts`) and not rely on the runtime provider list alone, or `request.isHtmx()` won't typecheck.

---

## Part 3: What already works well (keep it)

- **AD-4's named map** makes `needs('$timezone')`, `make(X, { name })` and implicit binding by segment name work exactly as in Laravel. Constructor property promotion carries over unchanged: `constructor(private spam: SpamChecker)`.
- **AD-8 reads well in practice.** `await user.related('posts').create(data)` maps one-to-one onto `$user->posts()->create($data)`, and `with({ posts: (q) => q.where(…) })` constraints are unaffected. The thunk also fixes the ESM cycle problem that `User` ↔ `Post` imports would otherwise cause.
- **AD-5's overlay** gives `View.share` / `config()` in a provider global (parity) and makes the same calls in middleware request-scoped. That is *better* than Laravel under Octane, with no API change. Fakes reset per test for free, once F-03 is fixed.
- **AD-6** keeps request input, session, config, `toSql()`, Collections and attribute access sync. That is where a Laravel developer's muscle memory lives. The thenable builder makes `await User.where(…).with('posts')` read like the PHP.
- **AD-9's BIGINT-as-`number` default** means `user.id` is a plain number, which is the right default for DX.
- **AD-11's "printing a Promise throws"** turns the most likely Blade mistake into a loud error.
- **AD-3's import paths** line up one-to-one with PHP `use` statements, so moving between the two is mechanical.
