import concurrent.futures
import json
import mimetypes
import os
from pathlib import Path
import threading

from qcloud_cos import CosConfig, CosS3Client


REGION = os.environ["TENCENT_COS_REGION"]
BUCKET = os.environ["TENCENT_COS_BUCKET"]
CONFIG = CosConfig(
    Region=REGION,
    SecretId=os.environ["TENCENT_SECRET_ID"],
    SecretKey=os.environ["TENCENT_SECRET_KEY"],
    Scheme="https",
)
CLIENT = CosS3Client(CONFIG)
ROOTS = (
    (Path(os.environ.get("FUCHONG_PUBLIC_DIR", "/srv/fuchong/current/dist/client")), ""),
    (Path(os.environ.get("FUCHONG_UPLOADS_DIR", "/srv/fuchong/shared/uploads")), "uploads"),
)
MIME_TYPES = {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".ogg": "audio/ogg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wav": "audio/wav",
    ".webm": "video/webm",
    ".webp": "image/webp",
}


def local_objects():
    for root, prefix in ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.is_file():
                relative = path.relative_to(root).as_posix()
                yield path, f"{prefix}/{relative}" if prefix else relative


def existing_objects():
    objects = set()
    marker = ""
    while True:
        page = CLIENT.list_objects(Bucket=BUCKET, Marker=marker, MaxKeys=1000)
        objects.update(item["Key"] for item in (page.get("Contents") or []))
        if page.get("IsTruncated") != "true":
            return objects
        marker = page.get("NextMarker") or ""


thread_state = threading.local()


def thread_client():
    if not hasattr(thread_state, "client"):
        thread_state.client = CosS3Client(CONFIG)
    return thread_state.client


def upload(item):
    path, key = item
    try:
        client = thread_client()
        client.put_object_from_local_file(
            Bucket=BUCKET,
            Key=key,
            LocalFilePath=str(path),
            ContentType=MIME_TYPES.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "application/octet-stream",
            CacheControl="public,max-age=31536000,immutable",
        )
        client.put_object_acl(Bucket=BUCKET, Key=key, ACL="public-read")
        return key, None
    except Exception as error:
        return key, str(error)[:300]


def main():
    current = existing_objects()
    pending = [(path, key) for path, key in local_objects() if key not in current]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(upload, pending))
    failures = [{"key": key, "error": error} for key, error in results if error]
    print(json.dumps({
        "bucket": BUCKET,
        "existing": len(current),
        "pending": len(pending),
        "uploaded": len(pending) - len(failures),
        "failed": failures,
    }, ensure_ascii=False))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
