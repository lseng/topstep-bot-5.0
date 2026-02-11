"""GitHub Operations Module - AI Developer Workflow (ADW)"""

import subprocess
import sys
import os
import json
from typing import Dict, List, Optional
from .data_types import GitHubIssue, GitHubIssueListItem, GitHubComment

# Bot identifier to prevent webhook loops and filter bot comments
ADW_BOT_IDENTIFIER = "[ADW-AGENTS]"


def get_github_env() -> Optional[dict]:
    """Get environment with GitHub token set up."""
    github_pat = os.getenv("GITHUB_PAT")
    if not github_pat:
        return None

    env = {
        "GH_TOKEN": github_pat,
        "PATH": os.environ.get("PATH", ""),
    }
    return env


def get_repo_url() -> str:
    """Get GitHub repository URL from git remote."""
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        raise ValueError(
            "No git remote 'origin' found. Please ensure you're in a git repository with a remote."
        )
    except FileNotFoundError:
        raise ValueError("git command not found. Please ensure git is installed.")


def extract_repo_path(github_url: str) -> str:
    """Extract owner/repo from GitHub URL."""
    return github_url.replace("https://github.com/", "").replace(".git", "")


def fetch_issue(issue_number: str, repo_path: str) -> GitHubIssue:
    """Fetch GitHub issue using gh CLI and return typed model."""
    cmd = [
        "gh",
        "issue",
        "view",
        issue_number,
        "-R",
        repo_path,
        "--json",
        "number,title,body,state,author,assignees,labels,milestone,comments,createdAt,updatedAt,closedAt,url",
    ]

    env = get_github_env()

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, env=env)

        if result.returncode == 0:
            issue_data = json.loads(result.stdout)
            issue = GitHubIssue(**issue_data)
            return issue
        else:
            print(result.stderr, file=sys.stderr)
            sys.exit(result.returncode)
    except FileNotFoundError:
        print("Error: GitHub CLI (gh) is not installed.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error parsing issue data: {e}", file=sys.stderr)
        sys.exit(1)


def make_issue_comment(issue_id: str, comment: str) -> None:
    """Post a comment to a GitHub issue using gh CLI."""
    github_repo_url = get_repo_url()
    repo_path = extract_repo_path(github_repo_url)

    if not comment.startswith(ADW_BOT_IDENTIFIER):
        comment = f"{ADW_BOT_IDENTIFIER} {comment}"

    cmd = [
        "gh",
        "issue",
        "comment",
        issue_id,
        "-R",
        repo_path,
        "--body",
        comment,
    ]

    env = get_github_env()

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, env=env)

        if result.returncode == 0:
            print(f"Successfully posted comment to issue #{issue_id}")
        else:
            print(f"Error posting comment: {result.stderr}", file=sys.stderr)
            raise RuntimeError(f"Failed to post comment: {result.stderr}")
    except Exception as e:
        print(f"Error posting comment: {e}", file=sys.stderr)
        raise


def mark_issue_in_progress(issue_id: str) -> None:
    """Mark issue as in progress by adding label and comment."""
    github_repo_url = get_repo_url()
    repo_path = extract_repo_path(github_repo_url)

    cmd = [
        "gh",
        "issue",
        "edit",
        issue_id,
        "-R",
        repo_path,
        "--add-label",
        "in_progress",
    ]

    env = get_github_env()

    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        print(f"Note: Could not add 'in_progress' label: {result.stderr}")

    cmd = [
        "gh",
        "issue",
        "edit",
        issue_id,
        "-R",
        repo_path,
        "--add-assignee",
        "@me",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if result.returncode == 0:
        print(f"Assigned issue #{issue_id} to self")


def fetch_open_issues(repo_path: str) -> List[GitHubIssueListItem]:
    """Fetch all open issues from the GitHub repository."""
    try:
        cmd = [
            "gh",
            "issue",
            "list",
            "--repo",
            repo_path,
            "--state",
            "open",
            "--json",
            "number,title,body,labels,createdAt,updatedAt",
            "--limit",
            "1000",
        ]

        env = get_github_env()

        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True, env=env
        )

        issues_data = json.loads(result.stdout)
        issues = [GitHubIssueListItem(**issue_data) for issue_data in issues_data]
        print(f"Fetched {len(issues)} open issues")
        return issues

    except subprocess.CalledProcessError as e:
        print(f"ERROR: Failed to fetch issues: {e.stderr}", file=sys.stderr)
        return []
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse issues JSON: {e}", file=sys.stderr)
        return []


def fetch_issue_comments(repo_path: str, issue_number: int) -> List[Dict]:
    """Fetch all comments for a specific issue."""
    try:
        cmd = [
            "gh",
            "issue",
            "view",
            str(issue_number),
            "--repo",
            repo_path,
            "--json",
            "comments",
        ]

        env = get_github_env()

        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True, env=env
        )
        data = json.loads(result.stdout)
        comments = data.get("comments", [])

        comments.sort(key=lambda c: c.get("createdAt", ""))

        return comments

    except subprocess.CalledProcessError as e:
        print(
            f"ERROR: Failed to fetch comments for issue #{issue_number}: {e.stderr}",
            file=sys.stderr,
        )
        return []
    except json.JSONDecodeError as e:
        print(
            f"ERROR: Failed to parse comments JSON for issue #{issue_number}: {e}",
            file=sys.stderr,
        )
        return []


def find_keyword_from_comment(keyword: str, issue: GitHubIssue) -> Optional[GitHubComment]:
    """Find the latest comment containing a specific keyword."""
    sorted_comments = sorted(issue.comments, key=lambda c: c.created_at, reverse=True)

    for comment in sorted_comments:
        if ADW_BOT_IDENTIFIER in comment.body:
            continue

        if keyword in comment.body:
            return comment

    return None
