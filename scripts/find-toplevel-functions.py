#!/usr/bin/env python3
"""Find TypeScript files that contain both a top-level function and a class.

Prints one path per matching file, relative to the project root (cwd).
Function-only files are skipped.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

DEFAULT_PATHS = [
    "packages/crdt-doc/src",
    "packages/document-model/src",
    "packages/rivto-editor-core/src",
    "packages/react-rivto-editor/src",
]
IGNORED_DIRECTORIES = {"coverage", "dist", "node_modules", "__tests__", ".test"}
SOURCE_EXTENSIONS = {".ts", ".tsx"}


def is_test_path(path: Path) -> bool:
    """Return whether `path` is a test file or lives under a test directory.

    @param path File or directory path.
    @returns True when the path should be skipped.
    """
    if any(part in IGNORED_DIRECTORIES or ".test" in part for part in path.parts):
        return True
    return ".test." in path.name


def collect_source_files(path: Path) -> list[Path]:
    """Collect TypeScript sources under `path`, skipping build, vendor, and tests.

    @param path File or directory to scan.
    @returns Sorted list of source files.
    """
    if is_test_path(path):
        return []
    if path.is_file():
        if path.suffix in SOURCE_EXTENSIONS and not path.name.endswith(".d.ts"):
            return [path]
        return []

    files: list[Path] = []
    for entry in sorted(path.iterdir()):
        if entry.is_dir():
            if entry.name not in IGNORED_DIRECTORIES and ".test" not in entry.name:
                files.extend(collect_source_files(entry))
            continue
        files.extend(collect_source_files(entry))
    return files


def is_keyword_at(source: str, index: int, word: str) -> bool:
    """Return whether `word` starts at `index` as a whole identifier.

    @param source File text.
    @param index Byte offset to test.
    @param word Keyword to match.
    @returns True when `word` is a standalone token at `index`.
    """
    n = len(source)
    length = len(word)
    return (
        source.startswith(word, index)
        and (index == 0 or not _is_ident_char(source[index - 1]))
        and (index + length >= n or not _is_ident_char(source[index + length]))
    )


def has_toplevel_function_and_class(source: str) -> bool:
    """Return whether `source` has both a module-level function and a class.

    Nested functions and class methods sit inside a brace block, so they do not
    count as the required top-level function. Files that only declare functions
    are skipped.

    @param source File text.
    @returns True when the file is allowed in the report.
    """
    brace_depth = 0
    paren_depth = 0
    bracket_depth = 0
    i = 0
    n = len(source)
    found_function = False
    found_class = False
    template_expr_depth: list[int] = []

    def skip_line_comment() -> None:
        nonlocal i
        while i < n and source[i] not in "\n\r":
            i += 1

    def skip_block_comment() -> None:
        nonlocal i
        while i < n - 1 and not (source[i] == "*" and source[i + 1] == "/"):
            i += 1
        i = min(i + 2, n)

    def skip_quoted(quote: str) -> None:
        nonlocal i
        i += 1
        while i < n:
            char = source[i]
            if char == "\\":
                i += 2
                continue
            if char == quote:
                i += 1
                return
            i += 1

    while i < n:
        char = source[i]

        if char == "/" and i + 1 < n and paren_depth == 0:
            nxt = source[i + 1]
            if nxt == "/":
                i += 2
                skip_line_comment()
                continue
            if nxt == "*":
                i += 2
                skip_block_comment()
                continue

        if char in {"'", '"'}:
            skip_quoted(char)
            continue

        if char == "`":
            i += 1
            while i < n:
                inner = source[i]
                if inner == "\\":
                    i += 2
                    continue
                if inner == "`":
                    i += 1
                    break
                if inner == "$" and i + 1 < n and source[i + 1] == "{":
                    template_expr_depth.append(brace_depth)
                    brace_depth += 1
                    i += 2
                    break
                i += 1
            continue

        if char == "{":
            brace_depth += 1
            i += 1
            continue
        if char == "}":
            if template_expr_depth and brace_depth - 1 == template_expr_depth[-1]:
                template_expr_depth.pop()
            brace_depth = max(0, brace_depth - 1)
            i += 1
            continue
        if char == "(":
            paren_depth += 1
            i += 1
            continue
        if char == ")":
            paren_depth = max(0, paren_depth - 1)
            i += 1
            continue
        if char == "[":
            bracket_depth += 1
            i += 1
            continue
        if char == "]":
            bracket_depth = max(0, bracket_depth - 1)
            i += 1
            continue

        at_module = brace_depth == 0 and paren_depth == 0 and bracket_depth == 0
        if at_module and is_keyword_at(source, i, "class"):
            found_class = True
        if at_module and is_keyword_at(source, i, "function"):
            found_function = True
        if found_function and found_class:
            return True

        i += 1

    return False


def _is_ident_char(char: str) -> bool:
    """Return whether `char` can continue a JavaScript identifier.

    @param char Single character.
    @returns True when the character is identifier-like.
    """
    return char.isalnum() or char in {"$", "_"}


def relpath(path: Path, root: Path) -> str:
    """Format `path` relative to `root` using POSIX separators.

    @param path File path.
    @param root Project root.
    @returns Relative POSIX path.
    """
    return path.resolve().relative_to(root.resolve()).as_posix()


def self_test() -> None:
    """Check mixed files are kept and function-only files are skipped."""
    mixed = """
class Box {
  method() {}
}

export async function top(a: number) {
  function nested() {}
  return a;
}
"""
    assert has_toplevel_function_and_class(mixed)
    assert not has_toplevel_function_and_class(
        "class Box { method() { function nested() {} } }",
    )
    assert not has_toplevel_function_and_class("export function top() { return 1; }\n")


def main(argv: list[str]) -> int:
    """Scan TypeScript files and print matching paths.

    @param argv Command-line arguments, including the program name.
    @returns Process exit status.
    """
    parser = argparse.ArgumentParser(
        description="Print TypeScript files that contain both a top-level function and a class.",
    )
    parser.add_argument(
        "paths",
        nargs="*",
        help="Files or directories to scan (default: editor package src trees).",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run the built-in scanner checks and exit.",
    )
    args = parser.parse_args(argv[1:])

    if args.self_test:
        self_test()
        print("Self-test passed")
        return 0

    root = Path.cwd()
    requested = [Path(path) for path in args.paths] if args.paths else [
        Path(path) for path in DEFAULT_PATHS
    ]
    files: list[Path] = []
    for path in requested:
        if not path.exists():
            print(f"missing path: {path}", file=sys.stderr)
            return 1
        files.extend(collect_source_files(path))

    for path in sorted(set(files)):
        if has_toplevel_function_and_class(path.read_text(encoding="utf-8")):
            print(relpath(path, root))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
