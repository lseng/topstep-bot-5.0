"""Cloudflare R2 uploader for ADW screenshots (optional)."""

import os
import logging
from typing import Optional, Dict, List
from pathlib import Path

# boto3 is optional - only needed if R2 uploads are configured
try:
    import boto3
    from botocore.client import Config
    from botocore.exceptions import ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False


class R2Uploader:
    """Handle uploads to Cloudflare R2 public bucket."""

    def __init__(self, logger: logging.Logger):
        self.logger = logger
        self.client = None
        self.bucket_name = None
        self.public_domain = None
        self.enabled = False

        self._initialize()

    def _initialize(self) -> None:
        """Initialize R2 client if all required environment variables are set."""
        if not BOTO3_AVAILABLE:
            self.logger.info("R2 upload disabled - boto3 not installed")
            return

        account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
        access_key_id = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID")
        secret_access_key = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
        self.bucket_name = os.getenv("CLOUDFLARE_R2_BUCKET_NAME")
        self.public_domain = os.getenv("CLOUDFLARE_R2_PUBLIC_DOMAIN")

        if not all([account_id, access_key_id, secret_access_key, self.bucket_name]):
            self.logger.info("R2 upload disabled - missing required environment variables")
            return

        try:
            self.client = boto3.client(
                's3',
                endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
                aws_access_key_id=access_key_id,
                aws_secret_access_key=secret_access_key,
                config=Config(signature_version='s3v4'),
                region_name='us-east-1'
            )
            self.enabled = True
            self.logger.info(f"R2 upload enabled - bucket: {self.bucket_name}")
        except Exception as e:
            self.logger.warning(f"Failed to initialize R2 client: {e}")
            self.enabled = False

    def upload_file(self, file_path: str, object_key: Optional[str] = None) -> Optional[str]:
        """Upload a file to R2 and return the public URL."""
        if not self.enabled:
            return None

        if not os.path.isabs(file_path):
            file_path = os.path.abspath(file_path)

        if not os.path.exists(file_path):
            self.logger.warning(f"File not found: {file_path}")
            return None

        if not object_key:
            object_key = f"adw/review/{Path(file_path).name}"

        try:
            self.client.upload_file(file_path, self.bucket_name, object_key)
            self.logger.info(f"Uploaded {file_path} to R2 as {object_key}")

            public_url = f"https://{self.public_domain}/{object_key}"
            return public_url

        except Exception as e:
            self.logger.error(f"Failed to upload {file_path} to R2: {e}")
            return None

    def upload_screenshots(self, screenshots: List[str], adw_id: str) -> Dict[str, str]:
        """Upload multiple screenshots and return mapping of local paths to public URLs."""
        url_mapping = {}

        for screenshot_path in screenshots:
            if not screenshot_path:
                continue

            filename = Path(screenshot_path).name
            object_key = f"adw/{adw_id}/review/{filename}"

            public_url = self.upload_file(screenshot_path, object_key)
            url_mapping[screenshot_path] = public_url or screenshot_path

        return url_mapping
