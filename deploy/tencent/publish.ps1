param(
    [Parameter(Mandatory = $true)]
    [string]$IdentityFile,
    [string]$Server = "43.166.1.45",
    [string]$SshUser = "ubuntu",
    [string]$ReleaseTag = (Get-Date -Format "yyyyMMdd-HHmmss")
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$resolvedKey = (Resolve-Path -LiteralPath $IdentityFile).Path
$remote = $SshUser + "@" + $Server
$remoteArchive = $remote + ":/home/ubuntu/fuchong-upload/source.tar.gz"
$remoteScript = $remote + ":/home/ubuntu/fuchong-upload/deploy-release.sh"
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("fuchong-release-" + [Guid]::NewGuid().ToString("N"))
$archive = Join-Path $temporaryRoot "source.tar.gz"

New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
try {
    Push-Location $projectRoot
    try {
        tar.exe -czf $archive `
            --exclude=.git `
            --exclude=node_modules `
            --exclude=dist `
            --exclude=work `
            --exclude=logs `
            --exclude=.wrangler `
            --exclude=.runtime `
            --exclude=.env `
            --exclude=server/data `
            --exclude=server/uploads `
            --exclude=server/backups `
            --exclude='*.log' `
            .
        if ($LASTEXITCODE -ne 0) { throw "Source archive failed" }
    } finally {
        Pop-Location
    }

    ssh -o StrictHostKeyChecking=accept-new -i $resolvedKey $remote "mkdir -p /home/ubuntu/fuchong-upload"
    if ($LASTEXITCODE -ne 0) { throw "Could not create the remote upload directory" }
    scp -q -o StrictHostKeyChecking=accept-new -i $resolvedKey $archive $remoteArchive
    if ($LASTEXITCODE -ne 0) { throw "Source upload failed" }
    scp -q -o StrictHostKeyChecking=accept-new -i $resolvedKey (Join-Path $PSScriptRoot "deploy-release.sh") $remoteScript
    if ($LASTEXITCODE -ne 0) { throw "Deployment script upload failed" }
    ssh -o StrictHostKeyChecking=accept-new -i $resolvedKey $remote "bash /home/ubuntu/fuchong-upload/deploy-release.sh '$ReleaseTag'"
    if ($LASTEXITCODE -ne 0) { throw "Server deployment failed; automatic rollback was attempted" }
} finally {
    $resolvedTemporaryRoot = [IO.Path]::GetFullPath($temporaryRoot)
    $resolvedSystemTemporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTemporaryRoot.StartsWith($resolvedSystemTemporaryRoot, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
