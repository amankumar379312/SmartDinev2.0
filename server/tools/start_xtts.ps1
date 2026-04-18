$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$pythonExe = Join-Path $repoRoot ".xtts-venv\Scripts\python.exe"
$speakerWav = Join-Path $repoRoot "server\voices\nova_indian_female.wav"

if (-not (Test-Path $pythonExe)) {
  throw "Missing XTTS virtual environment at $pythonExe"
}

if (-not (Test-Path $speakerWav)) {
  throw "Missing reference speaker WAV at $speakerWav"
}

$env:XTTS_SPEAKER_WAV = $speakerWav
$env:XTTS_LANGUAGE = "en"
$env:XTTS_AUTO_ACCEPT_CPML = "1"

& $pythonExe (Join-Path $repoRoot "server\tools\xtts_local_server.py")
