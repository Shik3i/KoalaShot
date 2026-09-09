import { t } from "./i18n.js";
export const APP_NAME = "KoalaShot";
export const STORE_NAME = t("ui_koalashot_full_page_screenshot");
export const VERSION = "0.6.1";

export const CAPTURE_INTERVAL_MS = 600;
export const PAINT_SETTLE_MS = 120;
export const WATCHDOG_TIMEOUT_MS = 30000;
export const CAPTURE_REQUEST_TIMEOUT_MS = 20000;
export const MAX_DYNAMIC_GROWTH_RATIO = 0.25;
export const MAX_RAW_CANVAS_BYTES = 512 * 1024 * 1024;
export const MAX_CANVAS_PIXELS = 100_000_000;
export const MAX_CANVAS_WIDTH = 32_768;
export const MAX_CANVAS_HEIGHT = 100_000;
export const TEMP_CAPTURE_TTL_MS = 24 * 60 * 60 * 1000;
export const STORAGE_DATABASE_NAME = "koalashot-captures";
export const STORAGE_DATABASE_VERSION = 2;
export const STORAGE_OBJECT_STORE = "captures";
export const STORAGE_DRAFT_STORE = "drafts";

export const USER_MESSAGES = Object.freeze({
  protectedPage: t("ui_koalashot_cannot_access_this_browser_protected_page"),
  internalScroll: t("ui_only_the_visible_area_was_captured_without_scrolling_content_outside_the_visible_area"),
  tooLarge: t("ui_this_page_is_too_large_to_create_as_one_png_at_the_current_resolution"),
  clipboardCopied: t("ui_full_page_screenshot_copied"),
});
