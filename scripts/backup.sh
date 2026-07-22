#!/bin/bash
# tinylnk - Automated SQLite database backup script
#
# Runs in a continuous loop inside the backup container, creating
# timestamped SQLite backups and pruning those older than the
# configured retention period.
#
# Environment variables:
#   SQLITE_DB_PATH       Path to the SQLite database file (default: /app/data/urlshortener.db)
#   BACKUP_DIR           Directory to store backups (default: /app/backups)
#   BACKUP_RETENTION_DAYS  Days to keep backups (default: 30)
#   BACKUP_INTERVAL      Seconds between backup cycles (default: 86400 = 24h)
#

set -e

DB_PATH="${SQLITE_DB_PATH:-/app/data/urlshortener.db}"
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
INTERVAL="${BACKUP_INTERVAL:-86400}"
LOG_FILE="${BACKUP_DIR}/backup.log"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

log() {
    local msg="[$(date +"%Y-%m-%d %H:%M:%S")] $1"
    echo "$msg" | tee -a "$LOG_FILE"
}

log "=== Backup service started ==="
log "Database: $DB_PATH"
log "Backup directory: $BACKUP_DIR"
log "Retention: ${RETENTION_DAYS} days"
log "Interval: ${INTERVAL}s"

while true; do
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="${BACKUP_DIR}/urlshortener_${TIMESTAMP}.db"

    # --- Perform backup ---
    log "Starting backup of $(basename "$DB_PATH")"

    if sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"; then
        SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log "Backup completed: $(basename "$BACKUP_FILE") (${SIZE})"
    else
        log "ERROR: Backup command failed for $(basename "$DB_PATH")"
        exit 1
    fi

    # --- Verify backup integrity ---
    if sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" 2>/dev/null | grep -q "^ok$"; then
        log "Integrity check passed: $(basename "$BACKUP_FILE")"
    else
        log "ERROR: Integrity check FAILED for $(basename "$BACKUP_FILE")"
        rm -f "$BACKUP_FILE"
        exit 1
    fi

    # --- Prune old backups ---
    log "Pruning backups older than ${RETENTION_DAYS} days"
    PRUNED=$(find "$BACKUP_DIR" -maxdepth 1 -name "urlshortener_*.db" -type f -mtime +"${RETENTION_DAYS}" -print -delete 2>>"$LOG_FILE" | wc -l)
    log "Pruned ${PRUNED} old backup(s)"

    log "Backup cycle complete. Next backup in ${INTERVAL}s."
    sleep "$INTERVAL" &  # trap-friendly background sleep
    wait $!
done
