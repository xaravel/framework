---
div: 12
title: "PHP member namespaces and magic members"
cites: ["AD-26", "AD-7"]
sources: []
fewer_assertions: []
---

# DIV-12: PHP member namespaces and magic members

## Rationale

PHP lets a property and a method share a name, and resolves some members dynamically (`__get`, `__call`, `ArrayAccess`). JavaScript has one namespace per object, and no such hooks outside a Proxy. Each PHP construct therefore has one decided TypeScript form (AD-26), so no Epic invents its own.

## Behaviour

- **Option pairs** such as `casts` / `casts()`, `middleware`, `backoff`, `tries`, `attachments` and `via` accept either form. Base classes declare neither, and the framework reads `option(this, name)`: it calls the member if it is a function, and otherwise reads its value.
- **Framework methods that share a name with state** (`delay()`, `afterCommit()`, `subject()`, …) keep the method name. The state is read through Upstream's getters.
- **Model accessors and scopes** are decorated: `@attribute(...) accessor title`, `@scope static published(query)`.
- **Model config properties win.** `fillable(arr)` becomes `setFillable(arr)`, and `touches(rel)` becomes `isTouching(rel)`. The full pair list is generated from Upstream at the Pin and committed in `PORTING.md`.
- **Request.** No magic input properties. Use `request.input('title')`, not `request.title`.
- **Collection index access** is `collection.get(0)`, not `collection[0]`. Index syntax works only on `Model`, through its Proxy.
- **Dynamic finders** (`whereEmail()`) are not supported. Use `where('email', v)`.

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-12.1** Option pairs. An Upstream test class that declares an option pair (`casts` / `casts()`, `middleware`, `backoff`, `tries`, `attachments`, `via`, …) as a property or as a method keeps the form it uses; both are accepted.
- **DIV-12.2** Framework methods that share a name with state. A call to the method (`delay()`, `afterCommit()`, `subject()`, …) is unchanged; an Upstream read of the state property becomes a read through Upstream's getter.
- **DIV-12.3** Model accessors and scopes. An Upstream accessor or mutator becomes `@attribute(...) accessor <name>`, and a local scope becomes `@scope static <name>(query)`.
- **DIV-12.4** Model config properties win. A call to `fillable(arr)` becomes `setFillable(arr)`, and a call to `touches(rel)` becomes `isTouching(rel)`, following the pair list in `PORTING.md`.
- **DIV-12.5** Request. A magic input property read such as `$request->title` becomes `request.input('title')`.
- **DIV-12.6** Collection index access. `$collection[0]` becomes `collection.get(0)`.
- **DIV-12.7** No dynamic wheres or finders. A dynamic `where<Column>()` call or dynamic finder such as `whereEmail()` is not supported; the Ported Test uses `where('email', v)`.
