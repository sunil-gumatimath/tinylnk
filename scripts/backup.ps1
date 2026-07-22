#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Automated SQLite database backup script for tinylnk.
.DESCRIPTION
    Creates timestamped backups of the SQLite database, verifies integrity,
    and prunes backups older than the retention period.
.PARAMETER DbPath
    Path to the SQLite database file. Defaults to ./data/urlshortener.db.
.PARAMETER BackupDir
    Directory to store backups. Defaults to ./backups.
.PARAMETER RetentionDays
    Number of days to keep backups. Defaults to 30.
.PARAMETER IntervalSeconds
    Seconds between backup cycles. Defaults to 86400 (24h).
    Set to 0 for a single run (for scheduled task usage).
.PARAMETER Once
    Run once and exit (for use with Windows Task Scheduler).
.EXAMPLE
    # Run continuously (24h loop)
    .\scripts\backup.ps1
.EXAMPLE
    # Run once (for Task Scheduler)
    .\scripts\backup.ps1 -Once -DbPath .\data\urlshortener.db
#>

param(
    [string]$DbPath = "",
    [string]$BackupDir = "",
    [int]$RetentionDays = 0,
    [int]$IntervalSeconds = 0,
    [switch]$Once
)

# Configuration with env var fallbacks
if (-not $DbPath) { $DbPath = $env:SQLITE_DB_PATH }
if (-not $DbPath) { $DbPath = ".\data\urlshortener.db" }

if (-not $BackupDir) { $BackupDir = $env:BACKUP_DIR }
if (-not $BackupDir) { $BackupDir = ".\backups" }

if ($RetentionDays -eq 0) {
    $retentionStr = $env:BACKUP_RETENTION_DAYS
    $RetentionDays = if ($retentionStr) { [int]$retentionStr } else { 30 }
}

if ($IntervalSeconds -eq 0) {
    $intervalStr = $env:BACKUP_INTERVAL
    $IntervalSeconds = if ($intervalStr) { [int]$intervalStr } else { 86400 }
}

$logFile = Join-Path $BackupDir "backup.log"

function Write-Log {
    param([string]$Level, [string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "$timestamp [$Level] $Message"
    Write-Host $line
    # Ensure log directory exists
    $logDir = Split-Path $logFile -Parent
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    Add-Content -Path $logFile -Value $line
}

function Test-DbIntegrity {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        Write-Log "ERROR" "Database not found: $Path"
        return $false
    }
    try {
        # Run integrity check using sqlite3.exe (via Python's built-in or direct)
        $check = & sqlite3 $Path "PRAGMA integrity_check;" 2>&1
        if ($LASTEXITCODE -ne 0 -or $check -ne "ok") {
            Write-Log "ERROR" "Integrity check failed for $Path`: $check"
            return $false
        }
        return $true
    }
    catch {
        Write-Log "ERROR" "Integrity check threw: $_"
        return $false
    }
}

function New-Backup {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupFile = Join-Path $BackupDir "urlshortener_$timestamp.db"

    Write-Log "INFO" "Starting backup of $DbPath → $backupFile"

    # Ensure directories exist
    $dbDir = Split-Path $DbPath -Parent
    if (-not (Test-Path $dbDir)) {
        Write-Log "WARN" "Database directory not found: $dbDir"
        return $false
    }
    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
        Write-Log "INFO" "Created backup directory: $BackupDir"
    }

    # Verify source integrity first
    if (-not (Test-DbIntegrity -Path $DbPath)) {
        Write-Log "ERROR" "Source database failed integrity check — skipping backup"
        return $false
    }

    # Perform backup using sqlite3 .backup (preferred) or copy fallback
    try {
        & sqlite3 $DbPath ".backup '$backupFile'" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "sqlite3 .backup exit code: $LASTEXITCODE" }
    }
    catch {
        Write-Log "WARN" "sqlite3 .backup failed ($_), falling back to file copy"
        try {
            Copy-Item $DbPath $backupFile -Force
        }
        catch {
            Write-Log "ERROR" "File copy backup also failed: $_"
            return $false
        }
    }

    # Verify backup integrity
    if (-not (Test-DbIntegrity -Path $backupFile)) {
        Write-Log "ERROR" "Backup file failed integrity check — removing corrupt backup"
        Remove-Item $backupFile -Force -ErrorAction SilentlyContinue
        return $false
    }

    $size = "{0:N2}" -f ((Get-Item $backupFile).Length / 1MB)
    Write-Log "INFO" "Backup completed: $backupFile ($size MB)"
    return $true
}

function Remove-OldBackups {
    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    $oldBackups = Get-ChildItem -Path $BackupDir -Filter "urlshortener_*.db" | Where-Object { $_.LastWriteTime -lt $cutoff }

    foreach ($old in $oldBackups) {
        try {
            Remove-Item $old.FullName -Force
            Write-Log "INFO" "Pruned old backup: $($old.Name)"
        }
        catch {
            Write-Log "WARN" "Failed to prune $($old.Name): $_"
        }
    }

    if ($oldBackups.Count -eq 0) {
        Write-Log "DEBUG" "No backups older than $RetentionDays days to prune"
    } else {
        Write-Log "INFO" "Pruned $($oldBackups.Count) old backup(s)"
    }
}

# ─── Main loop ─────────────────────────────────────────────

Write-Log "INFO" "=== Backup service started ==="
Write-Log "INFO" "Database: $DbPath"
Write-Log "INFO" "Backup dir: $BackupDir"
Write-Log "INFO" "Retention: $RetentionDays days"
if (-not $Once) {
    Write-Log "INFO" "Interval: $IntervalSeconds seconds"
}

do {
    $success = New-Backup
    Remove-OldBackups

    if (-not $success) {
        Write-Log "ERROR" "Backup cycle completed with errors"
    }

    if ($Once) {
        Write-Log "INFO" "=== One-shot backup complete ==="
        exit
    }

    Write-Log "DEBUG" "Sleeping for $IntervalSeconds seconds..."
    Start-Sleep -Seconds $IntervalSeconds
} while ($true)
