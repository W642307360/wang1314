export type ImageVariant = "thumb" | "detail";

const variantSize: Record<ImageVariant, { width: number; quality: number }> = {
  thumb: { width: 420, quality: 78 },
  detail: { width: 1200, quality: 88 },
};

const appendParams = (url: string, params: Record<string, string | number>) => {
  try {
    const parsed = new URL(url);
    Object.entries(params).forEach(([key, value]) => {
      if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, String(value));
    });
    return parsed.toString();
  } catch {
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}${new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    ).toString()}`;
  }
};

export const optimizePetImage = (
  url: string,
  variant: ImageVariant = "thumb",
  fallback = "",
) => {
  const source = url || fallback;
  if (!source || !source.startsWith("http")) return source;
  if (source.includes("/api/media/feishu")) return source;
  const { width, quality } = variantSize[variant];

  // 飞书、多维表格或后台同步过来的图片链接不改颜色，只补充“尺寸/格式/质量”参数。
  if (source.includes("images.unsplash.com")) {
    return appendParams(source, {
      auto: "format",
      fit: "crop",
      w: width,
      q: quality,
      fm: "webp",
    });
  }

  if (source.includes("Special:FilePath")) {
    return appendParams(source, { width });
  }

  if (/feishu|larksuite|feishu-/.test(source)) {
    return appendParams(source, { width, quality, format: "webp" });
  }

  return source;
};
