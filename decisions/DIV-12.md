---
div: 12
title: "PHP member namespaces and magic members"
cites: ["AD-26", "AD-7"]
sources: ["decisions/ESC-9.9-2.md", "decisions/ESC-9.9-3.md"]
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
- **Trait property defaults** are assigned after the base constructor returns. A trait's default replaces a base property of the same name only while the PHP property table shows that the base still holds its declared default; any other value is kept, so a write an `initialize<Trait>` makes during the base constructor survives (ESC-9.9-2). A base's private property and a trait property of the same name share the one JS slot, which keeps the base's value (ESC-9.9-3).

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-12.1** Option pairs. An Upstream test class that declares an option pair (`casts` / `casts()`, `middleware`, `backoff`, `tries`, `attachments`, `via`, …) as a property or as a method keeps the form it uses; both are accepted.
- **DIV-12.2** Framework methods that share a name with state. A call to the method (`delay()`, `afterCommit()`, `subject()`, …) is unchanged; an Upstream read of the state property becomes a read through Upstream's getter.
- **DIV-12.3** Model accessors and scopes. An Upstream accessor or mutator becomes `@attribute(...) accessor <name>`, and a local scope becomes `@scope static <name>(query)`.
- **DIV-12.4** Model config properties win. A call to `fillable(arr)` becomes `setFillable(arr)`, and a call to `touches(rel)` becomes `isTouching(rel)`, following the pair list in `PORTING.md`.
- **DIV-12.5** Request. A magic input property read such as `$request->title` becomes `request.input('title')`.
- **DIV-12.6** Collection index access. `$collection[0]` becomes `collection.get(0)`.
- **DIV-12.7** No dynamic wheres or finders. A dynamic `where<Column>()` call or dynamic finder such as `whereEmail()` is not supported; the Ported Test uses `where('email', v)`.
- **DIV-12.8** Trait defaults against a base property. When a trait and the base class it is mixed onto both declare an instance property of the same name, Xaravel differs from PHP in two cases. When the base chain declares no PHP property table listing the name, Xaravel keeps the base's value, where PHP has the trait's default. When a write made during the base constructor leaves the value PHP-identical to the base's declared default, Xaravel applies the trait's default, where PHP keeps the written value. A Ported Test whose outcome depends on either case is not adapted silently: it raises an Escalation (FR-114) (ESC-9.9-2).
- **DIV-12.9** A private base property against a trait property. When the base declares a private property and a trait mixed onto a subclass declares a public or protected property of the same name, PHP keeps two slots and Xaravel keeps one, holding the base's value. The base's own methods read what PHP gives them; code outside the base, and the subclass's own methods, read the base's value where PHP has the trait's default. A Ported Test whose outcome depends on it is not adapted silently: it raises an Escalation (FR-114) (ESC-9.9-3).
