import { existsSync, lstatSync, readdirSync, unlinkSync } from "node:fs";
import { resolve, sep } from "node:path";

export const pruneCacheDirectory = (
  directory,
  {
    maxBytes,
    maxAgeMs = 30 * 24 * 60 * 60 * 1000,
    now = Date.now(),
  } = {},
) => {
  const root = resolve(directory);
  const limit = Math.max(0, Number(maxBytes) || 0);
  const result = {
    scanned: 0,
    deleted: 0,
    retained: 0,
    bytes_before: 0,
    bytes_after: 0,
    failed: 0,
  };
  if (!existsSync(root)) return result;
  const files = [];
  for (const name of readdirSync(root)) {
    const absolute = resolve(root, name);
    if (!absolute.startsWith(`${root}${sep}`)) continue;
    try {
      const stat = lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      result.scanned++;
      result.bytes_before += Number(stat.size || 0);
      files.push({
        absolute,
        size: Number(stat.size || 0),
        modifiedAt: Number(stat.mtimeMs || 0),
      });
    } catch {
      result.failed++;
    }
  }
  let remaining = result.bytes_before;
  files.sort((left, right) => left.modifiedAt - right.modifiedAt);
  for (const file of files) {
    const expired = maxAgeMs > 0 && now - file.modifiedAt > maxAgeMs;
    if (!expired && remaining <= limit) {
      result.retained++;
      continue;
    }
    try {
      unlinkSync(file.absolute);
      remaining -= file.size;
      result.deleted++;
    } catch {
      result.failed++;
      result.retained++;
    }
  }
  result.bytes_after = Math.max(0, remaining);
  return result;
};
