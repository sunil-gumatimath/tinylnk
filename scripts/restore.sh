#!/bin/bash
# tinylnk - Database restore script
#
# Restores a SQLite database from a backup file created by backup.sh.
# Creates a pre-restore snapshot of the current database before
# overwriting it.
#
# Usage:
#   ./scripts/restore.sh /path/to/backup_file.db
#
# Environment variables:
#   SQLITE_DB_PATH  Path to the SQLite database file (default: /app/data/urlshortener.db)
#   BACKUP_DIR      Directory where backups are stored (default: /app/backups)
#

set -e

DB_PATH="${SQLITE_DB_PATH:-/app/data/urlshortener.db}"
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"

log() {
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] $1"
}

# --- Argument handling ---
if [ $# -lt 1 ]; then
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Available backups:"
    if [ -d "$BACKUP_DIR" ]; then
        ls -lh "$BACKUP_DIR"/urlshortener_*.db 2>/dev/null || echo "  (no backups found in $BACKUP_DIR)"
    else
        echo "  (backup directory $BACKUP_DIR does not exist)"
    fi
    exit 1
fi

BACKUP_FILE="$1"

# --- Validate backup file ---
if [ ! -f "$BACKUP_FILE" ]; then
    log "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

log "Validating backup file: $BACKUP_FILE"

if ! sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" 2>/dev/null | grep -q "^ok$"; then
    log "ERROR: Backup file is not a valid SQLite database or integrity check failed: $BACKUP_FILE"
    exit 1
fi

log "Backup file integrity check passed."

# --- Create pre-restore backup ---
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
PRE_RESTORE_BACKUP="${BACKUP_DIR}/pre_restore_${TIMESTAMP}.db"

log "Creating pre-restore backup of current database..."

if [ -f "$DB_PATH" ]; then
    if sqlite3 "$DB_PATH" ".backup '$PRE_RESTORE_BACKUP'"; then
        SIZE=$(du -h "$PRE_RESTORE_BACKUP" | cut -f1)
        log "Pre-restore backup saved: $(basename "$PRE_RESTORE_BACKUP") (${SIZE})"
    else
        log "WARNING: Could not create pre-restore backup of current database. Continuing anyway."
    fi
else
    log "No existing database found at $DB_PATH -- will create new database from backup."
fi

# --- Perform restore ---
log "Restoring database from: $(basename "$BACKUP_FILE")"

if sqlite3 "$DB_PATH" ".restore '$BACKUP_FILE'"; then
    log "Restore completed successfully."
else
    log "ERROR: Restore command failed."
    exit 1
fi

# --- Verify restored database ---
log "Verifying restored database integrity..."
if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null | grep -q "^ok$"; then
    log "Restored database integrity check passed."
else
    log "ERROR: Restored database integrity check FAILED."
    exit 1
fi

log "=== Restore complete ==="
log "Source backup: $(basename "$BACKUP_FILE")"
log "Restored to:   $DB_PATH"
log "Pre-restore backup: $(basename "$PRE_RESTORE_BACKUP")"
