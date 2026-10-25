#!/usr/bin/env python3
"""
Line up a numeric table from the original C++ against its TypeScript port, row by row,
and report rows that are missing, extra, or changed (with their original row numbers).

Usage:
  python3 diff_table.py <cpp_file> <cpp_table_name> <ts_file> [<ts_file> ...] [--ts-name NAME]

Examples:
  python3 diff_table.py ../Celestia/src/celephem/tass17.cpp IapetusTerms lib/ephemeris/tass17_iapetus_terms.ts
  python3 diff_table.py ../Celestia/src/celephem/tass17.cpp IapetusAPF src/tass17_data_iapetus_apf.ts

If the TS table has a different name, or is split across files (IapetusAPF_A + IapetusAPF_B),
pass all the files; every array whose name starts with the TS name (default: the C++ name) is
concatenated in file order. Use --ts-name to give a different prefix.

Writes table_diff.txt (paste it to the model that made the port).
"""
import difflib
import re
import sys
from pathlib import Path

NUM = re.compile(r"[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eEdD][-+]?\d+)?")


def strip_comments(s):
    return re.sub(r"//[^\n]*|/\*.*?\*/", "", s, flags=re.S)


def block_after(text, start):
    """Return the text inside the outermost brackets that open at or after `start`."""
    i = start
    while i < len(text) and text[i] not in "[{":
        i += 1
    if i >= len(text):
        return None
    depth, j = 0, i
    while j < len(text):
        if text[j] in "[{":
            depth += 1
        elif text[j] in "]}":
            depth -= 1
            if depth == 0:
                return text[i + 1:j]
        j += 1
    return None


def rows_from_body(body):
    rows = []
    for m in re.finditer(r"[\[{]([^\[\]{}]*)[\]}]", body):
        nums = NUM.findall(m.group(1))
        if nums:
            rows.append(tuple(round(float(n.replace("D", "e").replace("d", "e")), 15) for n in nums))
    return rows


def cpp_rows(path, name):
    text = strip_comments(Path(path).read_text())
    m = re.search(rf"\b{re.escape(name)}\b\s*(?:=\s*)?(?=[{{=])", text)
    if not m:
        m = re.search(rf"\b{re.escape(name)}\b", text)
    if not m:
        sys.exit(f"Couldn't find table {name} in {path}")
    body = block_after(text, m.end())
    return rows_from_body(body or "")


def ts_rows(paths, prefix):
    rows, found = [], []
    for p in paths:
        text = strip_comments(Path(p).read_text())
        for m in re.finditer(rf"export\s+const\s+({re.escape(prefix)}\w*)\s*(?::[^=]+)?=", text):
            body = block_after(text, m.end())
            r = rows_from_body(body or "")
            rows += r
            found.append(f"{m.group(1)} ({p}): {len(r)} rows")
    if not found:
        sys.exit(f"No exported array starting with {prefix} found in {', '.join(paths)}")
    return rows, found


def main():
    args = sys.argv[1:]
    ts_name = None
    if "--ts-name" in args:
        k = args.index("--ts-name")
        ts_name = args[k + 1]
        del args[k:k + 2]
    if len(args) < 3:
        sys.exit(__doc__)
    cpp_file, name, ts_files = args[0], args[1], args[2:]

    ref = cpp_rows(cpp_file, name)
    port, found = ts_rows(ts_files, ts_name or name)

    lines = [f"Original C++ {name}: {len(ref)} rows", "TypeScript port:"] + [f"  {f}" for f in found] + [f"  total: {len(port)} rows", ""]
    sm = difflib.SequenceMatcher(a=ref, b=port, autojunk=False)
    problems = 0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        problems += 1
        if tag == "delete":
            lines.append(f"MISSING in port: original rows {i1}..{i2 - 1} (0-based), which should come right after port row {j1 - 1}:")
            lines += [f"  row {i}: {ref[i]}" for i in range(i1, i2)]
        elif tag == "insert":
            lines.append(f"EXTRA in port: port rows {j1}..{j2 - 1} have no match in the original (they sit before original row {i1}):")
            lines += [f"  port row {j}: {port[j]}" for j in range(j1, j2)]
        else:
            lines.append(f"CHANGED: original rows {i1}..{i2 - 1} vs port rows {j1}..{j2 - 1}:")
            for k in range(max(i2 - i1, j2 - j1)):
                o = ref[i1 + k] if i1 + k < i2 else "(none)"
                p = port[j1 + k] if j1 + k < j2 else "(none)"
                lines.append(f"  original row {i1 + k if i1 + k < i2 else '-'}: {o}")
                lines.append(f"  port row     {j1 + k if j1 + k < j2 else '-'}: {p}")
        lines.append("")
    lines.append("Rows match exactly." if problems == 0 else f"{problems} difference block(s) found.")
    out = "\n".join(lines)
    print(out)
    Path("table_diff.txt").write_text(out + "\n")
    print("\nWrote table_diff.txt")


if __name__ == "__main__":
    main()
