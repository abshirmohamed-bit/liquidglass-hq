<#
    crayZmundo Engine -> Fly.io

    Does every remaining setup step in order, and is safe to re-run: anything
    that already exists is left alone. Secrets are read from the generated
    file and never printed.

    Run from the repo root in PowerShell:
        .\engine\deploy-fly.ps1
#>
[CmdletBinding()]
param(
    [string] $App     = "crayzmundo-engine",
    [string] $Region  = "syd",
    # The published crayZmundo site - where the Engine posts "clips are ready".
    [string] $SiteUrl = "https://liquidglass-hq.lovable.app",
    [string] $SecretsFile = "crayzmundo-secrets.local",
    # Trial orgs cannot create add-ons. Skip the bucket and keep clips on the
    # volume, which the Engine serves publicly from /media.
    [switch] $SkipStorage
)

$ErrorActionPreference = "Stop"
function Step($n, $m) { Write-Host "`n[$n] $m" -ForegroundColor Cyan }
function Ok($m)       { Write-Host "    $m" -ForegroundColor Green }
function Note($m)     { Write-Host "    $m" -ForegroundColor DarkGray }
function Die($m)      { Write-Host "`nSTOPPED: $m" -ForegroundColor Red; exit 1 }

# --- 0. where are we -------------------------------------------------------
$root = (Get-Location).Path
if (-not (Test-Path (Join-Path $root "engine\fly.toml"))) {
    Die "Run this from the repo root (the folder containing 'engine'). Currently in: $root"
}

# --- 1. flyctl -------------------------------------------------------------
Step 1 "Checking flyctl"
if (-not (Get-Command fly -ErrorAction SilentlyContinue)) {
    Note "Not installed. Installing..."
    Invoke-WebRequest https://fly.io/install.ps1 -UseBasicParsing | Invoke-Expression
    $env:PATH = "$env:USERPROFILE\.fly\bin;$env:PATH"
    if (-not (Get-Command fly -ErrorAction SilentlyContinue)) {
        Die "flyctl installed but not on PATH. Close and reopen PowerShell, then re-run."
    }
}
Ok (fly version)

# --- 2. sign in ------------------------------------------------------------
Step 2 "Checking you are signed in"
$who = (fly auth whoami 2>&1)
if ($LASTEXITCODE -ne 0) {
    Note "Not signed in. A browser window will open - sign in there, then come back."
    fly auth login
    if ($LASTEXITCODE -ne 0) { Die "Sign-in did not complete." }
    $who = (fly auth whoami 2>&1)
}
Ok "Signed in as $who"

# --- 3. read the generated secrets ----------------------------------------
Step 3 "Reading the generated credentials"
$path = Join-Path $root $SecretsFile
if (-not (Test-Path $path)) { Die "Cannot find $SecretsFile in $root" }
$vals = Select-String -Path $path -Pattern '^[A-Za-z0-9]{48}$' | ForEach-Object { $_.Line.Trim() }
if ($vals.Count -lt 2) { Die "Expected two 48-character values in $SecretsFile, found $($vals.Count)." }
$apiKey = $vals[0]; $hookSecret = $vals[1]
Ok "Found both values (not printed). Section 1 starts $($apiKey.Substring(0,6))..., Section 2 starts $($hookSecret.Substring(0,6))..."

# --- 4. the app ------------------------------------------------------------
Step 4 "App '$App'"
fly apps list 2>$null | Select-String -Quiet ([regex]::Escape($App)) | Out-Null
if (-not (fly apps list 2>$null | Select-String -Quiet ([regex]::Escape($App)))) {
    fly apps create $App
    Ok "Created."
} else { Ok "Already exists." }

# --- 5. the volume (must exist BEFORE deploy) ------------------------------
Step 5 "Volume 'crayz_data' - fly.toml mounts it, so the deploy fails without it"
if (-not (fly volumes list -a $App 2>$null | Select-String -Quiet "crayz_data")) {
    fly volumes create crayz_data --region $Region --size 10 -a $App --yes
    Ok "Created, 10GB in $Region."
} else { Ok "Already exists." }

# --- 6. object storage for finished clips ----------------------------------
Step 6 "Object storage (Tigris) for the rendered clips"
if ($SkipStorage) {
    Ok "Skipped (-SkipStorage). Clips stay on the volume, served from https://$App.fly.dev/media/..."
} elseif (-not (fly secrets list -a $App 2>$null | Select-String -Quiet "BUCKET_NAME")) {
    Note "Fly will print access keys. SAVE THEM - they cannot be shown again."
    fly storage create --public -a $App
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    Bucket NOT created (see the error above)." -ForegroundColor Yellow
        Write-Host "    Common cause: a trial organization needs a card before add-ons." -ForegroundColor Yellow
        Write-Host "    This is NOT fatal. Without a bucket the Engine keeps clips on the" -ForegroundColor Yellow
        Write-Host "    volume and serves them from https://$App.fly.dev/media/... , which is" -ForegroundColor Yellow
        Write-Host "    public. Add a card later, re-run this script, then set:" -ForegroundColor Yellow
        Write-Host "      fly secrets set S3_PUBLIC_BASE_URL=`"https://<bucket>.t3.tigrisfiles.io`" -a $App" -ForegroundColor Yellow
    } else {
        Ok "Created. The Engine switches itself from local disk to object storage."
        Note "Now set: fly secrets set S3_PUBLIC_BASE_URL=`"https://<bucket>.t3.tigrisfiles.io`" -a $App"
    }
} else { Ok "Already attached (BUCKET_NAME is set)." }

# --- 7. secrets ------------------------------------------------------------
Step 7 "Setting the Engine's secrets"
$site = $SiteUrl.TrimEnd('/')
fly secrets set `
    "ENGINE_API_KEYS=$apiKey" `
    "WEBHOOK_SECRET=$hookSecret" `
    "WEBHOOK_URL=$site/api/public/hooks/engine" `
    "PUBLIC_BASE_URL=https://$App.fly.dev" `
    -a $App --stage
Ok "Staged (applied on the next deploy, so the app restarts once, not four times)."

# --- 8. deploy -------------------------------------------------------------
Step 8 "Deploying - first build is slow, Whisper downloads onto the volume"
fly deploy ./engine -a $App
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nDeploy failed. Get the reason with:" -ForegroundColor Yellow
    Write-Host "    fly logs -a $App"
    Die "See the build output above."
}

# --- 9. prove it -----------------------------------------------------------
Step 9 "Checking it is alive"
Start-Sleep -Seconds 8
try {
    $h = Invoke-RestMethod "https://$App.fly.dev/v1/health" -TimeoutSec 30
    Ok "ffmpeg           : $($h.ffmpeg)"
    Ok "storage_backend  : $($h.storage_backend)   (want 's3')"
    Ok "transcribe       : $($h.transcribe_provider)"
    Ok "finder           : $($h.finder)            ('rules' = no Anthropic key, still works)"
} catch {
    Write-Host "    Health check did not answer yet. Try: fly logs -a $App" -ForegroundColor Yellow
}

Write-Host @"

Done. Remaining, by hand:
  1. In Lovable Secrets, edit ENGINE_WEBHOOK_SECRET to Section 2 of $SecretsFile
     (it must match what was just set on Fly, or clips silently never appear).
  2. Publish the Lovable app so the secrets apply to the live site.
  3. Settings -> Engine -> Send test event. A 200 means both halves agree.
  4. Delete $SecretsFile.

If step 6 could not create the bucket, nothing is broken: clips are stored on
the volume and served from https://$App.fly.dev/media/... . Health will report
storage_backend: local, which is correct until you add a card and re-run.
"@ -ForegroundColor White
