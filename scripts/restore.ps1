#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Restore a tinylnk SQLite database from a backup.
.DESCRIPTION
    Restores a SQLite database from a backup file. Creates a pre-restore
    snapshot of the current database before overwriting.
.PARAMETER BackupFile
    Path to the backup .db file to restore from.
.PARAMETER DbPath
    Path to the target SQLite database. Defaults to ./data/urlshortener.db.
.PARAMETER Force
    Skip confirmation prompt.
.EXAMPLE
    # List available backups
    .\scripts\restore.ps1
.EXAMPLE
    # Restore from a specific backup
    .\scripts\restore.ps1 -BackupFile .\backups\urlshortener_20260721-120000.db
.EXAMPLE
    # Restore without confirmation
    .\scripts\restore.ps1 -BackupFile .\backups\urlshortener_20260721-120000.db -Force
#>

param(
    [string]$BackupFile = "",
    [string]$DbPath = "",
    [switch]$Force
)

# Configuration
if (-not $DbPath) { $DbPath = $env:SQLITE_DB_PATH }
if (-not $DbPath) { $DbPath = ".\data\urlshortener.db" }
$backupDir = ".\backups"

# Resolve paths
$dbFullPath = Resolve-Path $DbPath -ErrorAction SilentlyContinue
if (-not $dbFullPath) {
    $dbFullPath = (Get-Item $DbPath -ErrorAction SilentlyContinue)
    if (-not $dbFullPath) { $dbFullPath = $DbPath }
    else { $dbFullPath = $dbFullPath.FullName }
}
$backupDirFull = Resolve-Path $backupDir -ErrorAction SilentlyContinue
if (-not $backupDirFull) { $backupDirFull = $backupDir }

function Write-Step { param([string]$Msg) Write-Host "  → $Msg" }

# ─── If no backup file specified, list available backups ───
if (-not $BackupFile) {
    Write-Host ""
    Write-Host "Available backups:" -ForegroundColor Cyan

    $backups = Get-ChildItem -Path $backupDirFull -Filter "urlshortener_*.db" 2>$null | Sort-Object LastWriteTime -Descending

    if (-not $backups -or $backups.Count -eq 0) {
        Write-Host "  No backups found in $backupDirFull" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Usage:" -ForegroundColor Green
        Write-Host "  .\scripts\restore.ps1 -BackupFile .\backups\urlshortener_YYYYMMDD-HHMMSS.db"
        exit 1
    }

    Write-Host "  Found $($backups.Count) backup(s):" -ForegroundColor Gray
    foreach ($b in $backups) {
        $size = "{0:N2}" -f ($b.Length / 1MB)
        $date = $b.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
        Write-Host "  [$date] $($b.Name) ($size MB)" -ForegroundColor White
    }

    Write-Host ""
    Write-Host "To restore:" -ForegroundColor Green
        Write-Host "  .\scripts\restore.ps1 -BackupFile .\backups\$($backups[0].Name)"
    Write-Host "  .\scripts\restore.ps1 -BackupFile .\backups\$($backups[0].Name) -Force  (skip confirmation)"
    exit 0
}

# ─── Validate backup file ─────────────────────────────────
$backupFullPath = Resolve-Path $BackupFile -ErrorAction SilentlyContinue
if (-not $backupFullPath) {
    Write-Host "ERROR: Backup file not found: $BackupFile" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Database Restore ===" -ForegroundColor Cyan
Write-Host "Backup file:  $backupFullPath"
Write-Host "Target DB:    $dbFullPath"

# Verify backup integrity
Write-Step "Verifying backup integrity..."
try {
    $check = & sqlite3 $backupFullPath "PRAGMA integrity_check;" 2>&1
    if ($LASTEXITCODE -ne 0 -or $check -ne "ok") {
        Write-Host "ERROR: Backup file failed integrity check: $check" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "ERROR: Could not run integrity check: $_" -ForegroundColor Red
    exit 1
}
Write-Step "Backup integrity: OK"

# Confirmation
if (-not $Force) {
    Write-Host ""
    Write-Host "WARNING: This will OVERWRITE the current database!" -ForegroundColor Yellow
    $confirmation = Read-Host "Type 'yes' to continue"
    if ($confirmation -ne "yes") {
        Write-Host "Restore cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Create pre-restore snapshot
$snapshotTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$snapshotFile = Join-Path $backupDir "pre-restore-$snapshotTimestamp.db"
Write-Step "Creating pre-restore snapshot: $snapshotFile"

if (Test-Path $dbFullPath) {
    try {
        & sqlite3 $dbFullPath ".backup '$snapshotFile'" 2>&1
        $size = "{0:N2}" -f ((Get-Item $snapshotFile).Length / 1MB)
        Write-Step "Pre-restore snapshot saved ($size MB)"
    }
    catch {
        Write-Host "WARN: Could not create pre-restore snapshot: $_" -ForegroundColor Yellow
    }
} else {
    Write-Step "No existing database found at target path"
}

# Perform restore
Write-Step "Restoring from backup..."
try {
    & sqlite3 $dbFullPath ".restore '$backupFullPath'" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "sqlite3 .restore exit code: $LASTEXITCODE" }
}
catch {
    Write-Host "ERROR: Restore failed: $_" -ForegroundColor Red

    # Offer to roll back
    if (Test-Path $snapshotFile) {
        Write-Host "Attempting rollback from pre-restore snapshot..." -ForegroundColor Yellow
        try {
            & sqlite3 $dbFullPath ".restore '$snapshotFile'" 2>&1
            Write-Step "Rollback completed"
        }
        catch {
            Write-Host "CRITICAL: Rollback also failed! Manual recovery needed." -ForegroundColor Red
            Write-Host "Snapshot saved at: $snapshotFile"
        }
    }
    exit 1
}

# Verify restored database
Write-Step "Verifying restored database integrity..."
try {
    $check = & sqlite3 $dbFullPath "PRAGMA integrity_check;" 2>&1
    if ($LASTEXITCODE -ne 0 -or $check -ne "ok") {
        Write-Host "ERROR: Restored database failed integrity check!" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "WARN: Could not verify restored database: $_" -ForegroundColor Yellow
}

Write-Step "Restored database integrity: OK"
Write-Host ""
Write-Host "✓ Restore completed successfully!" -ForegroundColor Green
Write-Host "  Pre-restore snapshot: $snapshotFile"
