const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? "" : "http://127.0.0.1:3001");

export const mediaUrl = (url?: string, variant: "thumb" | "original" = "thumb") => {
  if (!url) return "";
  if (url.startsWith("/api/") || url.startsWith("/uploads/")) return `${API_BASE}${url}`;
  if (/^https:\/\/open\.feishu\.cn\/open-apis\/drive\/v1\/medias\//.test(url))
    return `${API_BASE}/api/media/feishu?variant=${variant}&url=${encodeURIComponent(url)}`;
  return url;
};

export const mediaVideoUrl = (url?: string) => {
  if (!url) return "";
  if (url.startsWith("/api/") || url.startsWith("/uploads/")) return `${API_BASE}${url}`;
  if (/^https:\/\/open\.feishu\.cn\/open-apis\/drive\/v1\/medias\//.test(url))
    return `${API_BASE}/api/media/feishu?format=h264&url=${encodeURIComponent(url)}`;
  return url;
};
