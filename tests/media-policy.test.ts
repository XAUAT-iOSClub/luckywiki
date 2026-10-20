import test from "node:test";
import assert from "node:assert/strict";
import { formatFileSize } from "@/lib/media/format";
import {
  DEFAULT_MEDIA_ORPHAN_GRACE_DAYS,
  getMediaOrphanCutoff,
  getMediaOrphanGraceDays,
  isMediaAssetCleanupEligible,
} from "@/lib/media/policy";

test("formats file sizes", () => {
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(1023), "1023 B");
  assert.equal(formatFileSize(1024), "1 KB");
  assert.equal(formatFileSize(1536), "1.5 KB");
  assert.equal(formatFileSize(5 * 1024 * 1024), "5 MB");
});

test("reads the configurable grace period", () => {
  assert.equal(getMediaOrphanGraceDays(undefined), DEFAULT_MEDIA_ORPHAN_GRACE_DAYS);
  assert.equal(getMediaOrphanGraceDays(""), DEFAULT_MEDIA_ORPHAN_GRACE_DAYS);
  assert.equal(getMediaOrphanGraceDays("0"), 0);
  assert.equal(getMediaOrphanGraceDays("14"), 14);
  assert.equal(getMediaOrphanGraceDays("-3"), DEFAULT_MEDIA_ORPHAN_GRACE_DAYS);
  assert.equal(getMediaOrphanGraceDays("not-a-number"), DEFAULT_MEDIA_ORPHAN_GRACE_DAYS);
});

test("computes the orphan cutoff", () => {
  assert.equal(
    getMediaOrphanCutoff(new Date("2026-10-20T00:00:00.000Z"), 7).toISOString(),
    "2026-10-13T00:00:00.000Z",
  );
});

test("only unused, unlocked, expired assets are eligible for cleanup", () => {
  const now = new Date("2026-10-20T00:00:00.000Z");

  assert.equal(
    isMediaAssetCleanupEligible(
      {
        deletedAt: null,
        lastUsedAt: new Date("2026-10-01T00:00:00.000Z"),
        referenceCount: 0,
      },
      { graceDays: 7, now },
    ),
    true,
  );
  assert.equal(
    isMediaAssetCleanupEligible(
      {
        deletedAt: null,
        lastUsedAt: new Date("2026-10-01T00:00:00.000Z"),
        referenceCount: 1,
      },
      { graceDays: 7, now },
    ),
    false,
  );
  assert.equal(
    isMediaAssetCleanupEligible(
      {
        deletedAt: null,
        lastUsedAt: new Date("2026-10-19T00:00:00.000Z"),
        referenceCount: 0,
      },
      { graceDays: 7, now },
    ),
    false,
  );
  assert.equal(
    isMediaAssetCleanupEligible(
      {
        deletedAt: new Date("2026-10-19T00:00:00.000Z"),
        lastUsedAt: new Date("2026-10-01T00:00:00.000Z"),
        referenceCount: 0,
      },
      { graceDays: 7, now },
    ),
    false,
  );
});
