export type DataScope = "products" | "orders";

const EVENT_NAME = "fuchong:data-change";
const STORAGE_KEY = "fuchong:data-change";

export function announceDataChange(scope: DataScope) {
  const detail = { scope, at: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(detail));
  } catch {
    // The current tab still receives the CustomEvent when storage is unavailable.
  }
}

export function subscribeDataChange(scope: DataScope, callback: () => void) {
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ scope?: string }>).detail;
    if (detail?.scope === scope) callback();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      if (JSON.parse(event.newValue).scope === scope) callback();
    } catch {
      // Ignore malformed values from older builds.
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") callback();
  };
  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
