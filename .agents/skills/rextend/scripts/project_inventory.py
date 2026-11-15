#!/usr/bin/env python3
"""Create a read-only, dependency-free inventory of an existing software project folder.

The project may or may not be a Git repository. This script does not execute
project code and does not read environment or secret file contents. It inventories
paths, sizes, extensions, selected manifest names, and optional Git metadata.
Review generated reports before sharing them.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SKIP_DIRS = {
    ".git", ".hg", ".svn", ".idea", ".vscode", ".next", ".nuxt",
    "node_modules", "vendor", "dist", "build", "out", "target",
    "coverage", "__pycache__", ".pytest_cache", ".mypy_cache",
    ".ruff_cache", ".tox", ".venv", "venv", "env", "Pods",
    "DerivedData", ".terraform", ".gradle", ".cache", "bower_components",
}

MANIFEST_NAMES = {
    "package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "yarn.lock",
    "package-lock.json", "pyproject.toml", "requirements.txt", "Pipfile",
    "poetry.lock", "Cargo.toml", "Cargo.lock", "go.mod", "go.sum",
    "pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle",
    "Gemfile", "composer.json", "mix.exs", "deno.json", "deno.jsonc",
    "bun.lockb", "bun.lock", "Makefile", "justfile", "Taskfile.yml",
}

IMPORTANT_NAMES = {
    "README.md", "CONTRIBUTING.md", "LICENSE", "LICENSE.md", "CHANGELOG.md",
    "Dockerfile", "docker-compose.yml", "compose.yml", "compose.yaml",
    "Makefile", "justfile", "pyproject.toml", "package.json", "go.mod",
    "Cargo.toml", "pom.xml", "AGENTS.md", "CLAUDE.md", "CODEOWNERS",
    "SECURITY.md", ".gitignore", ".github/workflows",
}

IMPORTANT_HIDDEN_NAMES = {
    ".gitignore", ".gitattributes", ".gitmodules", ".editorconfig", ".npmrc",
    ".nvmrc", ".python-version", ".dockerignore", ".prettierignore",
    ".eslintignore", ".env.example", ".env.template",
}
IMPORTANT_HIDDEN_DIRS = {".github", ".husky", ".devcontainer", ".agents", ".claude", ".circleci", ".changeset"}

SECRETISH_NAMES = {
    ".env", ".env.local", ".env.production", "id_rsa", "id_ed25519",
    "credentials.json", "service-account.json", "secrets.yaml", "secrets.yml",
}


def git_value(root: Path, *args: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args], cwd=root, check=True, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5,
        )
        value = result.stdout.strip()
        return value or None
    except (OSError, subprocess.SubprocessError):
        return None


def classify_path(relative: str, name: str) -> list[str]:
    tags: list[str] = []
    lower = relative.lower()
    if name in MANIFEST_NAMES:
        tags.append("manifest-or-build")
    if name in {"README.md", "CONTRIBUTING.md", "CHANGELOG.md", "SECURITY.md", "AGENTS.md", "CLAUDE.md"}:
        tags.append("project-documentation-or-policy")
    if name in {"Dockerfile", "docker-compose.yml", "compose.yml", "compose.yaml"} or any(x in lower for x in ("/helm/", "/k8s/", "/kubernetes/", "/terraform/", "/.github/workflows/")):
        tags.append("infrastructure-or-ci")
    if lower.startswith(("test/", "tests/", "__tests__/")) or any(x in lower for x in ("/test/", "/tests/", "/__tests__/", ".test.", ".spec.")):
        tags.append("possible-test")
    if any(x in lower for x in ("/migration", "/migrations/", "/schema/", "/schemas/")):
        tags.append("possible-schema-or-migration")
    if any(x in lower for x in ("/api/", "/route", "/routes/", "/controller", "/controllers/")):
        tags.append("possible-api-or-routing")
    if any(x in lower for x in ("/worker", "/workers/", "/jobs/", "/queue", "/queues/", "/events/")):
        tags.append("possible-async-or-events")
    return tags


def build_inventory(root: Path, max_files: int, max_depth: int, include_hidden: bool) -> dict[str, Any]:
    files: list[dict[str, Any]] = []
    ext_counts: Counter[str] = Counter()
    top_dirs: Counter[str] = Counter()
    total_bytes = 0
    skipped_large = 0
    skipped_symlink = 0
    truncated = False
    sensitive_paths: list[str] = []
    manifest_paths: list[str] = []
    important_paths: list[str] = []

    for current, dirs, names in os.walk(root, topdown=True, followlinks=False):
        current_path = Path(current)
        relative_dir = current_path.relative_to(root)
        depth = 0 if str(relative_dir) == "." else len(relative_dir.parts)

        kept_dirs = []
        for dirname in sorted(dirs):
            candidate = current_path / dirname
            if dirname in SKIP_DIRS:
                continue
            if not include_hidden and dirname.startswith("."):
                # Keep common project governance and development configuration.
                if dirname not in IMPORTANT_HIDDEN_DIRS:
                    continue
            if candidate.is_symlink():
                skipped_symlink += 1
                continue
            if depth + 1 >= max_depth:
                continue
            kept_dirs.append(dirname)
        dirs[:] = kept_dirs

        for filename in sorted(names):
            path = current_path / filename
            try:
                rel = path.relative_to(root).as_posix()
                if path.is_symlink():
                    skipped_symlink += 1
                    continue
                stat = path.stat()
            except OSError:
                continue
            rel_parts = Path(rel).parts
            if not include_hidden and any(
                part.startswith(".") and part not in IMPORTANT_HIDDEN_DIRS
                for part in rel_parts[:-1]
            ):
                continue
            if not include_hidden and filename.startswith(".") and filename not in IMPORTANT_HIDDEN_NAMES and not filename.startswith(".env"):
                continue
            if stat.st_size > 25 * 1024 * 1024:
                skipped_large += 1
                continue
            if len(files) >= max_files:
                truncated = True
                break

            suffix = path.suffix.lower() or "[no extension]"
            ext_counts[suffix] += 1
            total_bytes += stat.st_size
            top = Path(rel).parts[0] if len(Path(rel).parts) > 1 else "[root]"
            top_dirs[top] += 1
            tags = classify_path(rel, filename)
            item = {"path": rel, "size_bytes": stat.st_size, "extension": suffix, "tags": tags}
            files.append(item)

            if filename in MANIFEST_NAMES:
                manifest_paths.append(rel)
            if filename in IMPORTANT_NAMES or rel.startswith(".github/workflows/"):
                important_paths.append(rel)
            if filename.lower() in SECRETISH_NAMES or filename.startswith(".env"):
                sensitive_paths.append(rel)

        if truncated:
            break

    git = {
        "is_git_repository": git_value(root, "rev-parse", "--is-inside-work-tree") == "true",
        "worktree_root": git_value(root, "rev-parse", "--show-toplevel"),
        "commit": git_value(root, "rev-parse", "HEAD"),
        "branch": git_value(root, "branch", "--show-current"),
        "status_porcelain": git_value(root, "status", "--short"),
        "latest_subject": git_value(root, "log", "-1", "--pretty=%s"),
    }

    source_type = "local-git" if git["is_git_repository"] else "local-non-git"

    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "root": str(root),
        "source_type": source_type,
        "git": git,
        "summary": {
            "file_count": len(files),
            "total_size_bytes": total_bytes,
            "extension_counts": dict(ext_counts.most_common()),
            "top_level_file_counts": dict(top_dirs.most_common()),
            "skipped_large_files_over_25mb": skipped_large,
            "skipped_symlinks": skipped_symlink,
            "truncated_at_max_files": truncated,
            "max_files": max_files,
            "max_directory_depth": max_depth,
        },
        "manifest_paths": sorted(set(manifest_paths)),
        "important_paths": sorted(set(important_paths)),
        "sensitive_or_environment_file_paths_redacted": sorted(set(sensitive_paths)),
        "files": files,
        "notes": [
            "Read-only inventory; project code was not executed.",
            "Secret-bearing file contents were not read. Paths are listed only for awareness.",
            "Generated/vendor/build/cache directories are excluded by default.",
            "This inventory is not a substitute for architecture or runtime analysis.",
        ],
    }


def render_markdown(data: dict[str, Any]) -> str:
    summary = data["summary"]
    lines = [
        "# Project Inventory", "",
        f"- **Project root:** `{data['root']}`",
        f"- **Source type:** `{data['source_type']}`",
        f"- **Git worktree root:** `{data['git'].get('worktree_root') or 'not applicable'}`",
        f"- **Generated (UTC):** `{data['generated_at_utc']}`",
        f"- **Commit:** `{data['git'].get('commit') or 'unavailable'}`",
        f"- **Branch:** `{data['git'].get('branch') or 'unavailable / detached'}`",
        f"- **Files inventoried:** {summary['file_count']}",
        f"- **Total inventoried size:** {summary['total_size_bytes']:,} bytes",
        f"- **Truncated:** {summary['truncated_at_max_files']}", "",
        "## Git metadata", "",
        "```text", data["git"].get("status_porcelain") or "(not a Git working tree or status unavailable)", "```", "",
        "## File types", "", "| Extension | Count |", "|---|---:|",
    ]
    for ext, count in summary["extension_counts"].items():
        lines.append(f"| `{ext}` | {count} |")
    lines += ["", "## Top-level distribution", "", "| Directory | File count |", "|---|---:|"]
    for dirname, count in summary["top_level_file_counts"].items():
        lines.append(f"| `{dirname}` | {count} |")
    lines += ["", "## Build / dependency manifests", ""]
    lines.extend(f"- `{p}`" for p in data["manifest_paths"] or ["(none identified)"])
    lines += ["", "## Important project files", ""]
    lines.extend(f"- `{p}`" for p in data["important_paths"] or ["(none identified)"])
    lines += ["", "## Environment / sensitive-looking paths (contents not read)", ""]
    lines.extend(f"- `{p}`" for p in data["sensitive_or_environment_file_paths_redacted"] or ["(none identified)"])
    lines += ["", "## Inventory notes", ""]
    lines.extend(f"- {note}" for note in data["notes"])
    lines += ["", "## File listing", "", "| Path | Bytes | Type | Tags |", "|---|---:|---|---|"]
    for item in data["files"]:
        tags = ", ".join(item["tags"])
        lines.append(f"| `{item['path']}` | {item['size_bytes']:,} | `{item['extension']}` | {tags} |")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", nargs="?", default=".", help="Project folder (default: current directory; Git is optional)")
    parser.add_argument("--out", default=".agent/project-inventory", help="Output directory (default: .agent/project-inventory)")
    parser.add_argument("--max-files", type=int, default=20000, help="Maximum files to inventory (default: 20000)")
    parser.add_argument("--max-depth", type=int, default=8, help="Maximum directory depth (default: 8)")
    parser.add_argument("--include-hidden", action="store_true", help="Include hidden directories/files except skipped directories")
    args = parser.parse_args()

    root = Path(args.project).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"Error: project path is not a directory: {root}", file=sys.stderr)
        return 2
    if args.max_files < 1 or args.max_depth < 1:
        print("Error: --max-files and --max-depth must be positive", file=sys.stderr)
        return 2

    out = Path(args.out).expanduser().resolve()
    try:
        out.mkdir(parents=True, exist_ok=True)
        data = build_inventory(root, args.max_files, args.max_depth, args.include_hidden)
        (out / "project-inventory.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
        (out / "project-inventory.md").write_text(render_markdown(data), encoding="utf-8")
    except OSError as exc:
        print(f"Error writing inventory: {exc}", file=sys.stderr)
        return 1

    print(f"Inventory written to: {out}")
    print(f"Files inventoried: {data['summary']['file_count']}")
    print("No project code was executed; secret file contents were not read.")
    if data["summary"]["truncated_at_max_files"]:
        print("Warning: inventory reached --max-files; increase the limit to continue.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
