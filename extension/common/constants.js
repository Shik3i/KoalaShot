export const APP_NAME = "KoalaShot";
export const STORE_NAME = "KoalaShot – Full Page Screenshot";
export const VERSION = "0.1.0";

export const CAPTURE_INTERVAL_MS = 600;
export const PAINT_SETTLE_MS = 120;
export const WATCHDOG_TIMEOUT_MS = 15000;
export const MAX_DYNAMIC_GROWTH_RATIO = 0.25;
export const MAX_RAW_CANVAS_BYTES = 512 * 1024 * 1024;
export const MAX_CANVAS_PIXELS = 100_000_000;
export const MAX_CANVAS_WIDTH = 32_768;
export const MAX_CANVAS_HEIGHT = 100_000;
export const TEMP_CAPTURE_TTL_MS = 24 * 60 * 60 * 1000;
export const STORAGE_DATABASE_NAME = "koalashot-captures";
export const STORAGE_DATABASE_VERSION = 1;
export const STORAGE_OBJECT_STORE = "captures";

export const USER_MESSAGES = Object.freeze({
  protectedPage: "KoalaShot cannot access this browser-protected page.",
  internalScroll: "This page uses an internal scroll area, which is not supported yet.",
  tooLarge: "This page is too large to create as one PNG at the current resolution.",
  clipboardCopied: "Full-page screenshot copied.",
});
