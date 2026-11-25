#!/usr/bin/env python3
"""Selector coverage against the widget toolkit's own dark theme.

Reads the SCSS sources of the proxmox-dark theme (proxmox-widget-toolkit, src/proxmox-dark/scss),
flattens the nesting into plain selectors and reports which of them src/structure.css also styles.
The upstream files are only read, never copied into this repository.

    python3 scripts/coverage.py --scss DIR          a local checkout's src/proxmox-dark/scss
    python3 scripts/coverage.py --fetch [--commit]  download the files from git.proxmox.com
    options: --min PERCENT (exit 1 below it), --missing (list uncovered selectors), --json

Python standard library only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STRUCTURE = ROOT / "src" / "structure.css"
# Pinned upstream commit the coverage numbers in the README refer to (proxmox-widget-toolkit).
UPSTREAM_COMMIT = "997a01a7bbdd4ac9ce8d624fcdc76c47421dbba7"
GITWEB = "https://git.proxmox.com/?p=proxmox-widget-toolkit.git;a=blob_plain;f=src/proxmox-dark/{path};hb={commit}"
# Selectors that only exist in Proxmox Mail Gateway or Backup Server views.
OTHER_PRODUCTS = re.compile(r"blocked|quarantine|bounced|pmg-|spam|pbs-|eol-notice")


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"(^|[^:])//[^\n]*", r"\1", text)


def split_selectors(text: str) -> list[str]:
    out, depth, cur = [], 0, ""
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return [s.strip() for s in out if s.strip()]


def normalize(selector: str) -> str:
    s = re.sub(r"\s+", " ", selector.strip())
    s = re.sub(r"\s*([>+~])\s*", r" \1 ", s)
    s = re.sub(r"(?<!:):(before|after|placeholder|selection)\b", r"::\1", s)
    return s.replace('"', "'")


def flatten(text: str) -> list[str]:
    """Plain selectors of every rule that has declarations, nesting resolved."""
    text = strip_comments(text)
    stack: list[list[str] | None] = []
    found: list[str] = []
    buf = ""
    for ch in text:
        if ch == "{":
            head = buf.strip()
            buf = ""
            if head.startswith("@") or not head:
                stack.append(None)
                continue
            parents = next((s for s in reversed(stack) if s is not None), None)
            parts = split_selectors(head)
            if parents:
                parts = [c.replace("&", p) if "&" in c else f"{p} {c}" for p in parents for c in parts]
            stack.append(parts)
        elif ch == "}":
            if stack:
                stack.pop()
            buf = ""
        elif ch == ";":
            if stack and stack[-1] is not None and ":" in buf and not buf.strip().startswith("@"):
                found.extend(stack[-1])
            buf = ""
        else:
            buf += ch
    seen, out = set(), []
    for s in (normalize(x) for x in found):
        if s not in seen and not s.startswith(":root"):
            seen.add(s)
            out.append(s)
    return out


def read_upstream(scss_dir: Path | None, commit: str) -> str:
    if scss_dir:
        files = sorted(p for p in scss_dir.rglob("*.scss"))
        return "\n".join(p.read_text(encoding="utf-8") for p in files)
    with urllib.request.urlopen(GITWEB.format(path="Makefile", commit=commit), timeout=30) as r:  # noqa: S310
        make = r.read().decode()
    paths = re.findall(r"(scss/[\w/]+\.scss)", make)
    texts = []
    for path in paths:
        with urllib.request.urlopen(GITWEB.format(path=path, commit=commit), timeout=30) as r:  # noqa: S310
            texts.append(r.read().decode())
    return "\n".join(texts)


def report(upstream: str, ours: str) -> dict:
    theirs = flatten(upstream)
    mine = set(flatten(ours))
    pve = [s for s in theirs if not OTHER_PRODUCTS.search(s)]
    covered = [s for s in pve if s in mine]
    missing = [s for s in pve if s not in mine]
    return {
        "upstream_selectors": len(theirs),
        "pve_selectors": len(pve),
        "covered": len(covered),
        "percent": round(100 * len(covered) / max(1, len(pve)), 1),
        "missing": missing,
        "ours": len(mine),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--scss", type=Path, help="directory with the proxmox-dark SCSS files")
    src.add_argument("--fetch", action="store_true", help="download them from git.proxmox.com")
    ap.add_argument("--commit", default=UPSTREAM_COMMIT)
    ap.add_argument("--min", type=float, default=0)
    ap.add_argument("--missing", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    data = report(read_upstream(args.scss, args.commit), STRUCTURE.read_text(encoding="utf-8"))
    if args.json:
        print(json.dumps(data, indent=2))
    else:
        print(f"proxmox-dark selectors for Proxmox VE views: {data['pve_selectors']} "
              f"(of {data['upstream_selectors']}); covered by src/structure.css: {data['covered']} "
              f"({data['percent']}%); selectors in src/structure.css: {data['ours']}")
        if args.missing:
            for s in data["missing"]:
                print(f"  missing: {s}")
    return 1 if data["percent"] < args.min else 0


if __name__ == "__main__":
    sys.exit(main())
