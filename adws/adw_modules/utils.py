"""Utility functions for ADW system."""

import json
import logging
import os
import re
import sys
import uuid
from datetime import datetime
from typing import Any, TypeVar, Type, Union, Dict, Optional

T = TypeVar('T')


def make_adw_id() -> str:
    """Generate a short 8-character UUID for ADW tracking."""
    return str(uuid.uuid4())[:8]


def setup_logger(adw_id: str, trigger_type: str = "adw_plan_build") -> logging.Logger:
    """Set up logger that writes to both console and file using adw_id."""
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    log_dir = os.path.join(project_root, "agents", adw_id, trigger_type)
    os.makedirs(log_dir, exist_ok=True)

    log_file = os.path.join(log_dir, "execution.log")

    logger = logging.getLogger(f"adw_{adw_id}")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    file_handler = logging.FileHandler(log_file, mode='a')
    file_handler.setLevel(logging.DEBUG)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)

    file_formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_formatter = logging.Formatter('%(message)s')

    file_handler.setFormatter(file_formatter)
    console_handler.setFormatter(console_formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    logger.info(f"ADW Logger initialized - ID: {adw_id}")
    logger.debug(f"Log file: {log_file}")

    return logger


def get_logger(adw_id: str) -> logging.Logger:
    """Get existing logger by ADW ID."""
    return logging.getLogger(f"adw_{adw_id}")


def parse_json(text: str, target_type: Type[T] = None) -> Union[T, Any]:
    """Parse JSON that may be wrapped in markdown code blocks."""
    code_block_pattern = r'```(?:json)?\s*\n(.*?)\n```'
    match = re.search(code_block_pattern, text, re.DOTALL)

    if match:
        json_str = match.group(1).strip()
    else:
        json_str = text.strip()

    if not (json_str.startswith('[') or json_str.startswith('{')):
        array_start = json_str.find('[')
        array_end = json_str.rfind(']')
        obj_start = json_str.find('{')
        obj_end = json_str.rfind('}')

        if array_start != -1 and (obj_start == -1 or array_start < obj_start):
            if array_end != -1:
                json_str = json_str[array_start:array_end + 1]
        elif obj_start != -1:
            if obj_end != -1:
                json_str = json_str[obj_start:obj_end + 1]

    try:
        result = json.loads(json_str)

        if target_type and hasattr(target_type, '__origin__'):
            if target_type.__origin__ == list:
                item_type = target_type.__args__[0]
                if hasattr(item_type, 'model_validate'):
                    result = [item_type.model_validate(item) for item in result]
                elif hasattr(item_type, 'parse_obj'):
                    result = [item_type.parse_obj(item) for item in result]
        elif target_type:
            if hasattr(target_type, 'model_validate'):
                result = target_type.model_validate(result)
            elif hasattr(target_type, 'parse_obj'):
                result = target_type.parse_obj(result)

        return result
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse JSON: {e}. Text was: {json_str[:200]}...")


def check_env_vars(logger: Optional[logging.Logger] = None) -> None:
    """Check that all required environment variables are set.

    Note: ANTHROPIC_API_KEY is NOT required because we use Claude Code CLI
    which uses your Claude Max subscription credits, not API credits.

    GITHUB_PAT is optional if you're authenticated via 'gh auth login'.
    """
    # No required env vars for ADW - we use Claude Code CLI (Max credits)
    # and gh CLI can use 'gh auth login' authentication
    pass


def check_required_tools(logger: Optional[logging.Logger] = None) -> None:
    """Check that all required CLI tools are installed.

    Required tools:
    - gh: GitHub CLI (must be authenticated via 'gh auth login')
    - git: Git version control
    - claude: Claude Code CLI (uses your Max subscription credits)
    """
    import shutil
    import subprocess

    def log_error(msg: str) -> None:
        if logger:
            logger.error(msg)
        else:
            print(msg, file=sys.stderr)

    def log_info(msg: str) -> None:
        if logger:
            logger.info(msg)
        else:
            print(msg)

    tools = {
        "gh": "GitHub CLI - install from https://cli.github.com/",
        "git": "Git - install from https://git-scm.com/",
        "claude": "Claude Code CLI - uses your Max subscription credits",
    }

    missing_tools = []
    for tool, description in tools.items():
        if not shutil.which(tool):
            missing_tools.append((tool, description))

    # Check gh auth status (only if gh is installed)
    if shutil.which("gh"):
        result = subprocess.run(
            ["gh", "auth", "status"],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            missing_tools.append(("gh auth", "GitHub CLI not authenticated - run: gh auth login"))
        else:
            log_info("✓ GitHub CLI authenticated")

    # Check claude CLI
    if shutil.which("claude"):
        log_info("✓ Claude Code CLI found (uses Max subscription credits)")

    if missing_tools:
        log_error("Error: Missing required tools:")
        for tool, desc in missing_tools:
            log_error(f"  - {tool}: {desc}")
        sys.exit(1)


def get_safe_subprocess_env() -> Dict[str, str]:
    """Get filtered environment variables safe for subprocess execution."""
    safe_env_vars = {
        "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY"),
        "GITHUB_PAT": os.getenv("GITHUB_PAT"),
        "CLAUDE_CODE_PATH": os.getenv("CLAUDE_CODE_PATH", "claude"),
        "CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR": os.getenv(
            "CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR", "true"
        ),
        "E2B_API_KEY": os.getenv("E2B_API_KEY"),
        "CLOUDFLARED_TUNNEL_TOKEN": os.getenv("CLOUDFLARED_TUNNEL_TOKEN"),
        "HOME": os.getenv("HOME"),
        "USER": os.getenv("USER"),
        "PATH": os.getenv("PATH"),
        "SHELL": os.getenv("SHELL"),
        "TERM": os.getenv("TERM"),
        "LANG": os.getenv("LANG"),
        "LC_ALL": os.getenv("LC_ALL"),
        "PYTHONPATH": os.getenv("PYTHONPATH"),
        "PYTHONUNBUFFERED": "1",
        "PWD": os.getcwd(),
    }

    github_pat = os.getenv("GITHUB_PAT")
    if github_pat:
        safe_env_vars["GH_TOKEN"] = github_pat

    return {k: v for k, v in safe_env_vars.items() if v is not None}
