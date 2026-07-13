'use strict';

/**
 * CLI backup — intended for a daily cron job.
 *
 *   npm run backup:create
 *   # crontab example (daily at 02:00):
 *   # 0 2 * * * cd /path/to/College-Software && /usr/bin/npm run backup:create >> logs/backup.log 2>&1
 *
 * Honors BACKUP_ENCRYPTION_KEY (encrypts at rest) and the
 * backup_retention_days setting (prunes old snapshots).
 */

const Backup = require('../src/services/backup');
const Setting = require('../src/models/setting');

try {
  const retentionDays = Setting.num('backup_retention_days', 30);
  const result = Backup.create({ retentionDays });
  const kb = Math.round(result.size / 1024);
  console.log(`✓ Backup created: ${result.name} (${kb} KB${result.encrypted ? ', encrypted' : ''})`);
  console.log(`  Location: ${result.full}`);
  console.log(`  Retention: ${retentionDays} day(s)`);
  process.exit(0);
} catch (err) {
  console.error('✗ Backup failed:', err.message);
  process.exit(1);
}
