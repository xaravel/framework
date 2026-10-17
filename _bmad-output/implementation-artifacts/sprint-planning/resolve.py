"""Resolve extracted Story selectors to Test IDs and write stories/<id>.md.

Usage: python3 -I resolve.py <repo> <dir with scope-*.json> [--write]
Stories that already have a manifest are left alone. To plan a deferred Story,
set its `deferred` to null in its scope file (after filling its selectors) and
re-run with --write. See ../story-manifests.md.
"""
import glob
import json
import os
import re
import sys

repo, sp = sys.argv[1], sys.argv[2]
write = "--write" in sys.argv

# ---- inventory -------------------------------------------------------------
tests = []  # (id, paths:set, names:list)
for f in sorted(glob.glob(os.path.join(repo, "conformance/inventory/*.jsonl"))):
    for line in open(f):
        d = json.loads(line)
        if "source" not in d:
            continue
        src = d["source"].rsplit(":", 1)[0]
        paths = {src}
        tid = d["id"]
        cls, _, rest = tid.partition("::")
        if src.startswith("framework/") and cls.startswith("Illuminate\\Tests\\"):
            paths.add("framework/tests/" + cls[len("Illuminate\\Tests\\"):].replace("\\", "/") + ".php")
        names = [rest, rest.split("#", 1)[0]]
        tests.append((tid, paths, names, d["component"]))
print(f"inventory: {len(tests)} tests", file=sys.stderr)


def path_re(g):
    out = ""
    i = 0
    while i < len(g):
        if g.startswith("**", i):
            out += ".*"
            i += 2
        elif g[i] == "*":
            out += "[^/]*"
            i += 1
        else:
            out += re.escape(g[i])
            i += 1
    return re.compile(out + r"\Z")


def name_re(g):
    return re.compile("".join(".*" if c == "*" else re.escape(c) for c in g) + r"\Z", re.S)


def match(sel):
    if "::" in sel:
        p, _, m = sel.partition("::")
    else:
        p, m = sel, "*"
    pr, mr = path_re(p), name_re(m)
    return [t[0] for t in tests if any(pr.match(x) for x in t[1]) and any(mr.match(n) for n in t[2])]


# ---- stories ---------------------------------------------------------------
stories = []
for f in sorted(glob.glob(os.path.join(sp, "scope-*.json")), key=lambda x: int(re.search(r"(\d+)", os.path.basename(x)).group(1))):
    stories.extend(json.load(open(f)))


def key(s):
    a, b = s["story"].split(".")
    return (int(a), int(b))


stories.sort(key=key)

epics = open(os.path.join(repo, "_bmad-output/planning-artifacts/epics.md")).read().splitlines()
heading = {}
for i, l in enumerate(epics, 1):
    m = re.match(r"### Story (\d+\.\d+): (.*)", l)
    if m:
        heading[m.group(1)] = (i, m.group(2).strip())
status_text = open(os.path.join(repo, "_bmad-output/implementation-artifacts/sprint-status.yaml")).read()
sprint_keys = re.findall(r"^  (\d+-\d+-[a-z0-9-]+):", status_text, re.M)


def sprint_key(sid):
    pre = sid.replace(".", "-") + "-"
    ks = [k for k in sprint_keys if k.startswith(pre)]
    return ks[0] if len(ks) == 1 else None


problems = []
claimed = {}  # id -> story
per_story = {s["story"]: [] for s in stories}
zero = []
widened = []

# pass 1: explicit selectors
for s in stories:
    if s.get("deferred"):
        continue
    for ac in s["acs"]:
        if ac["verify"] != "selectors":
            continue
        ex = set()
        for e in ac.get("exclude", []):
            got = match(e)
            if not got and "*" not in e.partition("::")[2]:
                got = match(e + "*")
            ex.update(got)
        for sel in ac.get("include", []):
            got = match(sel)
            if not got and "*" not in sel.partition("::")[2]:
                got = match(sel + "*")
                if got:
                    widened.append((s["story"], sel, len(got)))
            if not got:
                zero.append((s["story"], sel))
            for t in got:
                if t in ex:
                    continue
                if t in claimed:
                    if claimed[t] != s["story"]:
                        continue
                else:
                    claimed[t] = s["story"]
                    per_story[s["story"]].append(t)
# pass 2: residuals
for s in stories:
    if s.get("deferred"):
        continue
    for ac in s["acs"]:
        for r in ac.get("residual", []) or []:
            got = match(r)
            if not got:
                zero.append((s["story"], "residual " + r))
            for t in got:
                if t not in claimed:
                    claimed[t] = s["story"]
                    per_story[s["story"]].append(t)

# ---- XT allocation ---------------------------------------------------------
xt_next = {}
for p in glob.glob(os.path.join(repo, "stories/*.md")):
    for c, n in re.findall(r"XT-([a-z][a-z0-9-]*)-(\d+)", open(p).read()):
        xt_next[c] = max(xt_next.get(c, 1), int(n) + 1)
xt_next["conformance"] = max(xt_next.get("conformance", 1), 171)

COMPONENT = re.compile(r"^[a-z][a-z0-9-]*$")
out = []
deferred = []
for s in stories:
    sid = s["story"]
    if sid not in heading:
        problems.append(f"{sid}: no heading in epics.md")
        continue
    if s.get("deferred"):
        deferred.append((sid, heading[sid][1], s["deferred"]))
        continue
    if os.path.exists(os.path.join(repo, "stories", sid + ".md")):
        continue  # already planned; its selectors still claimed above, in Story order
    comp = s["component"]
    if not COMPONENT.match(comp or ""):
        problems.append(f"{sid}: bad component {comp!r}")
        continue
    sk = sprint_key(sid)
    if not sk:
        problems.append(f"{sid}: no unique sprint key")
    rows = []
    xts = []
    for ac in s["acs"]:
        if ac["verify"] == "xt":
            n = xt_next.get(comp, 1)
            xt_next[comp] = n + 1
            x = f"XT-{comp}-{n}"
            xts.append(x)
            rows.append((x, ac["given"]))
        else:
            rows.append(("Upstream selectors", ac["given"]))
    ids = sorted(per_story[sid])
    sel_acs = [ac for ac in s["acs"] if ac["verify"] == "selectors"]
    if sel_acs and not ids:
        problems.append(f"{sid}: selector ACs resolved to zero Test IDs")
    if not ids and not xts:
        problems.append(f"{sid}: no tests at all")
    out.append(dict(story=sid, epic=int(sid.split(".")[0]), component=comp, title=heading[sid][1], line=heading[sid][0],
                    sprint_key=sk, ids=ids, xts=xts, rows=rows, sel_acs=sel_acs, kind=s["kind"]))


def q(v):
    return json.dumps(v, ensure_ascii=False)


def given(text):
    t = text.strip()
    t = re.sub(r"^\*\*Given\*\*\s*", "", t)
    return t.replace("|", "\\|")


if write:
    for m in out:
        lines = ["---", f"story_id: {q(m['story'])}", f"epic: {m['epic']}", f"component: {m['component']}", "status: backlog",
                 f"title: {q(m['title'])}"]
        if m["sprint_key"]:
            lines.append(f"sprint_key: {m['sprint_key']}")
        lines.append("test_ids:" + ("" if m["ids"] else " []"))
        lines += [f"  - {q(t)}" for t in m["ids"]]
        lines.append("xaravel_test_ids:" + ("" if m["xts"] else " []"))
        lines += [f"  - {x}" for x in m["xts"]]
        lines += ["---", "", f"# Story {m['story']}: {m['title']}", "",
                  f"Source: `_bmad-output/planning-artifacts/epics.md` line {m['line']}. Branch: `story/{m['story']}`.", "",
                  "Each acceptance criterion, in order, is verified by the Xaravel Test or the Upstream Test IDs beside it (FR-115, AD-16).", "",
                  "| Verified by | Acceptance criterion (Given …) |", "| --- | --- |"]
        lines += [f"| {a} | {given(b)} |" for a, b in m["rows"]]
        if m["sel_acs"]:
            lines += ["", f"The Upstream selectors below resolve to the {len(m['ids'])} Test IDs in `test_ids`, against the Test Inventory at the Baseline Pin. A Test ID an earlier Story's selector matched belongs to that Story.", ""]
            for ac in m["sel_acs"]:
                for sel in ac.get("include", []):
                    lines.append(f"- `{sel}`")
                for sel in ac.get("exclude", []):
                    lines.append(f"- excluding `{sel}`")
                for r in ac.get("residual", []) or []:
                    lines.append(f"- every Test ID in `{r}` that no selector matched")
        with open(os.path.join(repo, "stories", m["story"] + ".md"), "x") as fh:
            fh.write("\n".join(lines) + "\n")

json.dump(dict(written=len(out), widened=widened, deferred=deferred, problems=problems, zero=zero,
               counts={m["story"]: [len(m["ids"]), len(m["xts"])] for m in out},
               unclaimed_framework=sum(1 for t in tests if t[0] not in claimed and next(iter(t[1])).startswith("framework/")),
               xt_next=xt_next), open(os.path.join(sp, "report.json"), "w"), indent=1)
print(json.dumps(dict(written=len(out), deferred=len(deferred), problems=len(problems), zero=len(zero)), indent=1))
