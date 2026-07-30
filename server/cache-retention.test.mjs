import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneCacheDirectory } from "./cache-retention.mjs";

test("可再生媒体缓存按容量删除最旧文件，不跟随符号链接", () => {
  const root = mkdtempSync(join(tmpdir(), "fuchong-cache-retention-"));
  const outside = join(tmpdir(), `fuchong-cache-outside-${Date.now()}.bin`);
  try {
    const oldest = join(root, "oldest.bin");
    const newest = join(root, "newest.bin");
    writeFileSync(oldest, Buffer.alloc(4096, 1));
    writeFileSync(newest, Buffer.alloc(4096, 2));
    writeFileSync(outside, Buffer.from("do-not-delete"));
    utimesSync(oldest, new Date(1000), new Date(1000));
    utimesSync(newest, new Date(2000), new Date(2000));
    try {
      symlinkSync(outside, join(root, "outside-link"));
    } catch {}

    const result = pruneCacheDirectory(root, {
      maxBytes: 4096,
      maxAgeMs: 0,
    });
    assert.equal(result.deleted, 1);
    assert.equal(result.bytes_after, 4096);
    assert.equal(existsSync(oldest), false);
    assert.equal(existsSync(newest), true);
    assert.equal(existsSync(outside), true);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    rmSync(outside, { force: true });
  }
});
