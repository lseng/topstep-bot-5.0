"""Git operations for ADW composable architecture."""

import subprocess
import json
import logging
from typing import Optional, Tuple

from adw_modules.github import get_repo_url, extract_repo_path, make_issue_comment


def get_current_branch(cwd: Optional[str] = None) -> str:
    """Get current git branch name."""
    result = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    return result.stdout.strip()


def push_branch(
    branch_name: str, cwd: Optional[str] = None
) -> Tuple[bool, Optional[str]]:
    """Push current branch to remote. Returns (success, error_message)."""
    result = subprocess.run(
        ["git", "push", "-u", "origin", branch_name],
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    if result.returncode != 0:
        return False, result.stderr
    return True, None


def check_pr_exists(branch_name: str) -> Optional[str]:
    """Check if PR exists for branch. Returns PR URL if exists."""
    try:
        repo_url = get_repo_url()
        repo_path = extract_repo_path(repo_url)
    except Exception as e:
        return None

    result = subprocess.run(
        [
            "gh",
            "pr",
            "list",
            "--repo",
            repo_path,
            "--head",
            branch_name,
            "--json",
            "url",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        prs = json.loads(result.stdout)
        if prs:
            return prs[0]["url"]
    return None


def create_branch(
    branch_name: str, cwd: Optional[str] = None
) -> Tuple[bool, Optional[str]]:
    """Create and checkout a new branch. Returns (success, error_message)."""
    result = subprocess.run(
        ["git", "checkout", "-b", branch_name], capture_output=True, text=True, cwd=cwd
    )
    if result.returncode != 0:
        if "already exists" in result.stderr:
            result = subprocess.run(
                ["git", "checkout", branch_name],
                capture_output=True,
                text=True,
                cwd=cwd,
            )
            if result.returncode != 0:
                return False, result.stderr
            return True, None
        return False, result.stderr
    return True, None


def commit_changes(
    message: str, cwd: Optional[str] = None
) -> Tuple[bool, Optional[str]]:
    """Stage all changes and commit. Returns (success, error_message)."""
    result = subprocess.run(
        ["git", "status", "--porcelain"], capture_output=True, text=True, cwd=cwd
    )
    if not result.stdout.strip():
        return True, None

    result = subprocess.run(
        ["git", "add", "-A"], capture_output=True, text=True, cwd=cwd
    )
    if result.returncode != 0:
        return False, result.stderr

    result = subprocess.run(
        ["git", "commit", "-m", message], capture_output=True, text=True, cwd=cwd
    )
    if result.returncode != 0:
        return False, result.stderr
    return True, None


def get_pr_number(branch_name: str) -> Optional[str]:
    """Get PR number for a branch. Returns PR number if exists."""
    try:
        repo_url = get_repo_url()
        repo_path = extract_repo_path(repo_url)
    except Exception as e:
        return None

    result = subprocess.run(
        [
            "gh",
            "pr",
            "list",
            "--repo",
            repo_path,
            "--head",
            branch_name,
            "--json",
            "number",
            "--limit",
            "1",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        prs = json.loads(result.stdout)
        if prs:
            return str(prs[0]["number"])
    return None


def approve_pr(pr_number: str, logger: logging.Logger) -> Tuple[bool, Optional[str]]:
    """Approve a PR. Returns (success, error_message)."""
    try:
        repo_url = get_repo_url()
        repo_path = extract_repo_path(repo_url)
    except Exception as e:
        return False, f"Failed to get repo info: {e}"

    result = subprocess.run(
        [
            "gh",
            "pr",
            "review",
            pr_number,
            "--repo",
            repo_path,
            "--approve",
            "--body",
            "ADW Ship workflow approved this PR after validating all state fields.",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return False, result.stderr

    logger.info(f"Approved PR #{pr_number}")
    return True, None


def merge_pr(
    pr_number: str, logger: logging.Logger, merge_method: str = "squash"
) -> Tuple[bool, Optional[str]]:
    """Merge a PR. Returns (success, error_message)."""
    try:
        repo_url = get_repo_url()
        repo_path = extract_repo_path(repo_url)
    except Exception as e:
        return False, f"Failed to get repo info: {e}"

    result = subprocess.run(
        [
            "gh",
            "pr",
            "view",
            pr_number,
            "--repo",
            repo_path,
            "--json",
            "mergeable,mergeStateStatus",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return False, f"Failed to check PR status: {result.stderr}"

    pr_status = json.loads(result.stdout)
    if pr_status.get("mergeable") != "MERGEABLE":
        return (
            False,
            f"PR is not mergeable. Status: {pr_status.get('mergeStateStatus', 'unknown')}",
        )

    merge_cmd = [
        "gh",
        "pr",
        "merge",
        pr_number,
        "--repo",
        repo_path,
        f"--{merge_method}",
    ]

    merge_cmd.extend(
        ["--body", "Merged by ADW Ship workflow after successful validation."]
    )

    result = subprocess.run(merge_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return False, result.stderr

    logger.info(f"Merged PR #{pr_number} using {merge_method} method")
    return True, None


def finalize_git_operations(
    state: "ADWState", logger: logging.Logger, cwd: Optional[str] = None
) -> None:
    """Standard git finalization: push branch and create/update PR."""
    branch_name = state.get("branch_name")
    if not branch_name:
        current_branch = get_current_branch(cwd=cwd)
        if current_branch and current_branch != "main":
            logger.warning(
                f"No branch name in state, using current branch: {current_branch}"
            )
            branch_name = current_branch
        else:
            logger.error(
                "No branch name in state and current branch is main, skipping git operations"
            )
            return

    success, error = push_branch(branch_name, cwd=cwd)
    if not success:
        logger.error(f"Failed to push branch: {error}")
        return

    logger.info(f"Pushed branch: {branch_name}")

    pr_url = check_pr_exists(branch_name)
    issue_number = state.get("issue_number")
    adw_id = state.get("adw_id")

    if pr_url:
        logger.info(f"Found existing PR: {pr_url}")
        if issue_number and adw_id:
            make_issue_comment(issue_number, f"{adw_id}_ops: Pull request: {pr_url}")
    else:
        if issue_number:
            try:
                repo_url = get_repo_url()
                repo_path = extract_repo_path(repo_url)
                from adw_modules.github import fetch_issue

                issue = fetch_issue(issue_number, repo_path)

                from adw_modules.workflow_ops import create_pull_request

                pr_url, error = create_pull_request(branch_name, issue, state, logger, cwd)
            except Exception as e:
                logger.error(f"Failed to fetch issue for PR creation: {e}")
                pr_url, error = None, str(e)
        else:
            pr_url, error = None, "No issue number in state"

        if pr_url:
            logger.info(f"Created PR: {pr_url}")
            if issue_number and adw_id:
                make_issue_comment(
                    issue_number, f"{adw_id}_ops: Pull request created: {pr_url}"
                )
        else:
            logger.error(f"Failed to create PR: {error}")
