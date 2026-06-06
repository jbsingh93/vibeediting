<#
  capabilities/screen-record/gdigrab.ps1 — FALLBACK A: Windows desktop capture (plan P1G.5, GAP-62).

  The ONLY path that natively gives true CFR + audio + the REAL OS cursor. Use it when the brief wants:
    - a literal full-desktop capture, or
    - audio captured in the SAME pass (synchronized voiceover), or
    - non-browser UI on screen (an installed app, the taskbar, a native dialog).

  SECURITY (GAP-65): gdigrab films the ENTIRE screen — it WILL capture notifications, UAC dialogs,
  overlapping windows, password managers. PREFER the sandboxed page.screencast/CDP capture
  (record-session.ts / cdp-screencast.ts) whenever a secret could be on screen. Never type real
  credentials on-camera.

  Captures clock-driven at a constant 30 fps (gdigrab is timestamped by the wall clock → no VFR), then
  encodes H.264 CRF 18 (or NVENC). Output is path-guarded to the repo's out/ tree by the caller.

  Usage (PowerShell):
    .\gdigrab.ps1 -Output out\<project>\screen-record\desktop.mp4 [-Source desktop|"title=Window - Google Chrome"]
                  [-Fps 30] [-DurationSec 20] [-Audio "Microphone (Realtek)"] [-Nvenc] [-Region "x,y,w,h"]
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Output,
  [string]$Source = 'desktop',
  [int]$Fps = 30,
  [int]$DurationSec = 0,         # 0 = until Ctrl+C
  [string]$Audio = '',          # dshow audio device name; '' = no audio
  [switch]$Nvenc,
  [string]$Region = ''          # "x,y,w,h" → -offset_x/-offset_y/-video_size
)

$ErrorActionPreference = 'Stop'

# Resolve the FULL ffmpeg (same precedence as capabilities/_env/ffmpeg.ts:
# VIBE_FFMPEG (file or dir) → .vibe/bin → PATH).
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ffmpeg = $env:VIBE_FFMPEG
if ($ffmpeg -and (Test-Path $ffmpeg -PathType Container)) { $ffmpeg = Join-Path $ffmpeg 'ffmpeg.exe' }
if (-not $ffmpeg -or -not (Test-Path $ffmpeg)) { $ffmpeg = Join-Path $repoRoot '.vibe\bin\ffmpeg.exe' }
if (-not (Test-Path $ffmpeg)) {
  $onPath = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($onPath) { $ffmpeg = $onPath.Source }
  else { throw "ffmpeg not found (looked at VIBE_FFMPEG, .vibe\bin\ffmpeg.exe, PATH) - run 'vibe setup --ffmpeg'" }
}

# Path-guard: the output must live under the repo's out/ or test-video/ (mirrors guards.ts, GAP-65).
$outFull = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Output))
$allowed = @('out', 'test-video', 'public') | ForEach-Object { (Join-Path $repoRoot $_) }
if (-not ($allowed | Where-Object { $outFull.StartsWith($_, [System.StringComparison]::OrdinalIgnoreCase) })) {
  throw "Refusing to write outside out/ | test-video/ | public/ : $outFull"
}
New-Item -ItemType Directory -Force -Path (Split-Path $outFull) | Out-Null

# Build the input args.
$inArgs = @('-f', 'gdigrab', '-framerate', "$Fps", '-draw_mouse', '1')
if ($Region) {
  $parts = $Region.Split(',')
  if ($parts.Count -ne 4) { throw "-Region must be 'x,y,w,h'" }
  $inArgs += @('-offset_x', $parts[0], '-offset_y', $parts[1], '-video_size', "$($parts[2])x$($parts[3])")
}
$inArgs += @('-i', $Source)

if ($Audio) { $inArgs = @('-f', 'dshow', '-i', "audio=$Audio") + $inArgs }

# Codec args.
if ($Nvenc) { $codec = @('-c:v', 'h264_nvenc', '-rc', 'constqp', '-qp', '18', '-preset', 'p4') }
else { $codec = @('-c:v', 'libx264', '-crf', '18', '-preset', 'fast') }
$codec += @('-vf', 'format=yuv420p', '-vsync', 'cfr', '-movflags', '+faststart')
if ($Audio) { $codec += @('-c:a', 'aac', '-b:a', '192k') }

$dur = @()
if ($DurationSec -gt 0) { $dur = @('-t', "$DurationSec") }

$allArgs = @('-y') + $inArgs + $dur + $codec + @($outFull)
Write-Host "gdigrab → $outFull  (source=$Source, fps=$Fps, nvenc=$($Nvenc.IsPresent))"
& $ffmpeg @allArgs
if ($LASTEXITCODE -ne 0) { throw "ffmpeg gdigrab exited $LASTEXITCODE" }
Write-Host "OK: $outFull"
