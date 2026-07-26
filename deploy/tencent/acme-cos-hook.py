import os
import sys
import time
from urllib.request import urlopen

from qcloud_cos import CosConfig, CosS3Client


mode = sys.argv[1]
token = os.environ["CERTBOT_TOKEN"]
key = f".well-known/acme-challenge/{token}"
client = CosS3Client(CosConfig(
    Region=os.environ["TENCENT_COS_REGION"],
    SecretId=os.environ["TENCENT_SECRET_ID"],
    SecretKey=os.environ["TENCENT_SECRET_KEY"],
    Scheme="https",
))
bucket = os.environ["TENCENT_COS_BUCKET"]

if mode == "auth":
    validation = os.environ["CERTBOT_VALIDATION"]
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=validation.encode("utf-8"),
        ContentType="text/plain",
        CacheControl="no-store,max-age=0",
        ACL="public-read",
    )
    url = f"http://media.petinmyall.me/{key}"
    for _ in range(15):
        try:
            with urlopen(url, timeout=10) as response:
                if response.read().decode("utf-8").strip() == validation:
                    break
        except Exception:
            pass
        time.sleep(2)
    else:
        raise SystemExit("ACME challenge did not become available through CDN")
elif mode == "cleanup":
    try:
        client.delete_object(Bucket=bucket, Key=key)
    except Exception:
        pass
else:
    raise SystemExit(f"unsupported hook mode: {mode}")
