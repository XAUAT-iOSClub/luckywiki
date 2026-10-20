const byteUnits = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    byteUnits.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  const fractionDigits = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;

  const formattedValue = value
    .toFixed(fractionDigits)
    .replace(/\.0+$/u, "")
    .replace(/(\.\d*[1-9])0+$/u, "$1");

  return `${formattedValue} ${byteUnits[unitIndex]}`;
}
