---
div: 2
title: "Strict Loading by default"
cites: ["AD-8"]
sources: []
fewer_assertions: []
---

# DIV-2: Strict Loading by default

## Rationale

PHP lets a relationship be both a method (`$m->posts()`, the builder) and a magic property (`$m->posts`, lazy-loaded on first read). JavaScript has one namespace per object, and a lazy load is IO (DIV-1), which a sync property read cannot perform. So relationships must be eager-loaded or explicitly awaited (FR-63), with one definition style and one builder method (AD-8).

## Behaviour

- **Definition.** A relationship is a decorated accessor, for example `@hasMany(() => Post) accessor posts!: Collection<Post>`. The decorator's callback receives the Relation and may return a different Relation (`one()`, `latestOfMany()`, `through()`). `resolveRelationUsing(name, fn)` defines relations at runtime with the same semantics.
- **Reading.** `model.posts` returns the loaded relation, or throws `LazyLoadingViolationException`. Assigning to it calls `setRelation`.
- **Building.** `model.related('posts')` is the relationship builder, and `model.posts()` does not exist. Awaiting `related(name)` unchained loads the relation if it is missing and caches it on the model; a chained query never caches. Relation mutators keep Upstream's side effects.
- **Automatic eager loading.** When it is enabled, awaiting `related(name)` with no chained calls, on a model that came from a collection, eager-loads `name` for the whole collection in one query. Sync reads of the relation on the sibling models then succeed. A sync read of a relation that isn't loaded still throws. (Maintainer decision, 2026-10-16.)

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-2.1** The relationship method becomes the builder: Laravel's `$m->rel()` becomes `m.related('rel')`. Chained calls and the assertions on their result are unchanged.
- **DIV-2.2** Lazy loading through property access becomes an explicit load: a test that relies on lazy `$m->rel` is adapted to `await m.related('rel')`. The assertions on the loaded value are unchanged.
