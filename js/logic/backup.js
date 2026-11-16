// Backup reminder rule (DESIGN section 3). Pure: the current time is passed in.

export const BACKUP_MAX_AGE_DAYS = 3;
const DAY_MS = 86400000;

/**
 * Should the "back up your plan" banner show?
 * Yes when the plan changed since the last export, or the last export is older than 3 days.
 * A plan that was never changed and never exported stays quiet (nothing to lose yet).
 * @param {string|null} lastBackupAt ISO timestamp of the last export
 * @param {boolean} changedSinceBackup
 * @param {number} nowMs milliseconds since epoch (caller passes Date.now())
 * @returns {{show: boolean, reason: string}}
 */
export function backupReminder(lastBackupAt, changedSinceBackup, nowMs) {
  if (changedSinceBackup) {
    return { show: true, reason: lastBackupAt ? "You've changed your plan since you last saved a copy." : "You haven't saved a copy of your plan yet." };
  }
  if (lastBackupAt) {
    const then = new Date(lastBackupAt).getTime();
    if (Number.isNaN(then)) return { show: true, reason: "It's time to save a copy of your plan." };
    if (nowMs - then > BACKUP_MAX_AGE_DAYS * DAY_MS) {
      return { show: true, reason: `It's been more than ${BACKUP_MAX_AGE_DAYS} days since you saved a copy of your plan.` };
    }
  }
  return { show: false, reason: "" };
}
