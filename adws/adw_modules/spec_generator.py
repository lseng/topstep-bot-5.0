"""Spec Generator - Converts GitHub issues to Ralph-compatible spec files."""

import os
import re
from typing import Tuple, Optional
from adw_modules.data_types import GitHubIssue


def slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    slug = text.lower()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = slug.strip('-')
    return slug[:50]


def generate_spec_from_issue(
    issue: GitHubIssue,
    issue_class: str,
    output_dir: str,
) -> Tuple[Optional[str], Optional[str]]:
    """Generate a spec file from a GitHub issue."""
    specs_dir = os.path.join(output_dir, "specs")
    os.makedirs(specs_dir, exist_ok=True)

    slug = slugify(issue.title)
    filename = f"{slug}.md"
    filepath = os.path.join(specs_dir, filename)

    spec_type_map = {
        "/feature": "Feature",
        "/bug": "Bug Fix",
        "/chore": "Maintenance",
    }
    spec_type = spec_type_map.get(issue_class, "Task")

    labels = [label.name for label in issue.labels] if issue.labels else []
    labels_str = ", ".join(labels) if labels else "none"

    spec_content = f"""# {issue.title}

**Type:** {spec_type}
**GitHub Issue:** #{issue.number}
**Labels:** {labels_str}

## Overview

{issue.body or "No description provided."}

## Requirements

Based on the issue description above, implement the requested changes.

## Acceptance Criteria

- [ ] All requirements from the issue are addressed
- [ ] Code follows existing patterns in the codebase
- [ ] No regressions introduced
- [ ] Changes are properly tested (if applicable)

## Technical Notes

- Issue URL: {issue.url}
- Created: {issue.created_at}
- Author: {issue.author.login if issue.author else "unknown"}

---
*This spec was auto-generated from GitHub issue #{issue.number}*
"""

    try:
        with open(filepath, 'w') as f:
            f.write(spec_content)

        return f"specs/{filename}", None

    except Exception as e:
        return None, f"Failed to write spec file: {e}"


def clear_specs_directory(specs_dir: str) -> None:
    """Remove all spec files from the specs directory."""
    if not os.path.exists(specs_dir):
        return

    for filename in os.listdir(specs_dir):
        if filename.endswith('.md'):
            filepath = os.path.join(specs_dir, filename)
            try:
                os.remove(filepath)
            except Exception:
                pass
