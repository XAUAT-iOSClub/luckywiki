export const DEFAULT_MEDIA_ORPHAN_GRACE_DAYS = 7;
export const MAX_MEDIA_ORPHAN_GRACE_DAYS = 3650;

export function getMediaOrphanGraceDays(rawValue = process.env.MEDIA_ORPHAN_GRACE_DAYS) {
  const value = rawValue?.trim();

  if (!value) {
    return DEFAULT_MEDIA_ORPHAN_GRACE_DAYS;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_MEDIA_ORPHAN_GRACE_DAYS;
  }

  return Math.min(Math.floor(parsed), MAX_MEDIA_ORPHAN_GRACE_DAYS);
}

export function getMediaOrphanCutoff(now: Date, graceDays: number) {
  return new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);
}

export type MediaCleanupCandidate = {
  deletedAt: Date | null;
  lastUsedAt: Date;
  referenceCount: number;
};

/**
 * Pure eligibility check used by tests and by the cleanup query builder.
 * Assets must be unused, not already locked for cleanup, and older than the
 * grace period since their last use.
 */
export function isMediaAssetCleanupEligible(
  asset: MediaCleanupCandidate,
  options: { now: Date; graceDays: number },
) {
  if (asset.deletedAt !== null || asset.referenceCount > 0) {
    return false;
  }

  return asset.lastUsedAt.getTime() < getMediaOrphanCutoff(options.now, options.graceDays).getTime();
}
