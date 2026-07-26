import json
import os
from pathlib import Path

from tencentcloud.common import credential
from tencentcloud.cdn.v20180606 import cdn_client, models


domain = os.environ.get("TENCENT_CDN_DOMAIN", "media.petinmyall.me")
lineage = Path(os.environ.get("CDN_CERT_LINEAGE", f"/etc/letsencrypt/live/{domain}"))
client = cdn_client.CdnClient(
    credential.Credential(os.environ["TENCENT_SECRET_ID"], os.environ["TENCENT_SECRET_KEY"]),
    "",
)

certificate = models.ServerCert()
certificate.Certificate = (lineage / "fullchain.pem").read_text()
certificate.PrivateKey = (lineage / "privkey.pem").read_text()

https = models.Https()
https.Switch = "on"
https.Http2 = "on"
https.OcspStapling = "on"
https.CertInfo = certificate
https.TlsVersion = ["TLSv1.2", "TLSv1.3"]

hsts = models.Hsts()
hsts.Switch = "on"
hsts.MaxAge = 31536000
hsts.IncludeSubDomains = "off"
https.Hsts = hsts

redirect = models.ForceRedirect()
redirect.Switch = "on"
redirect.RedirectType = "https"
redirect.RedirectStatusCode = 301

request = models.UpdateDomainConfigRequest()
request.Domain = domain
request.Https = https
request.ForceRedirect = redirect
response = client.UpdateDomainConfig(request)
print(json.dumps({"domain": domain, "request_id": response.RequestId, "https": "deploying"}))
