import { initializeUi } from "../common/ui.js";
import { t } from "../common/i18n.js";
import {
  captureScreenshot, copyScreenshot, downloadBlob, loadSettings,
  openEditorForCapture, prepareClipboard, pruneTemporaryCaptures, saveSettings,
} from "./capture-controller.js";
import { createSerializedWriter } from "../common/async-queue.js";
import { getApi } from "../common/browser-api.js";
import { initializeFooter } from "../common/product-links.js";

const $ = (id) => document.getElementById(id);
const captureTarget = $("capture-target");
const status = $("status");
const preview = $("capture-preview");
const progressBar = $("progress-bar");
const queueSettingsSave = createSerializedWriter(saveSettings);
let initializing = true;
let phase = "idle";
let activeController = null;
let lastCapturedResult = null;
let previewUrl = null;
let settingsRevision = 0;
let pendingSettings = 0;
let savedTarget = "page";
let lastMode = "edit";

function updateAreaHelp() {
  $("capture-area-help").textContent = captureTarget.value === "visible"
    ? t("ui_captures_exactly_what_is_visible_now_without_scrolling_or_changing_the_page")
    : captureTarget.value === "internal"
      ? t("ui_captures_the_largest_fully_visible_scrollable_area_including_its_content_below_the_fo")
      : t("ui_captures_the_page_from_top_to_bottom_if_only_an_inner_area_scrolls_captures_the_visib");
}

function setStatus(message, progress = null) {
  status.textContent = message;
  if (progress !== null) progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

function setPhase(value) {
  phase = value;
  const busy = value !== "idle" || initializing;
  for (const id of ["copy-button", "save-button", "edit-button", "copy-result-button", "save-result-button", "edit-result-button", "capture-again-button", "capture-internal-button", "capture-visible-button"]) $(id).disabled = busy;
  captureTarget.disabled = busy;
  $("cancel-button").hidden = value !== "capturing";
  $("progress-track").hidden = value !== "capturing";
  $("capture-actions").hidden = Boolean(lastCapturedResult);
  $("capture-area-help").hidden = Boolean(lastCapturedResult);
  $("result-card").hidden = !lastCapturedResult;
  document.querySelector(".keep-open").hidden = Boolean(lastCapturedResult) && value !== "capturing";
  document.body.dataset.phase = value;
  if (value === "idle") progressBar.style.width = "0";
}

function showResult(result) {
  const oldUrl = previewUrl;
  previewUrl = URL.createObjectURL(result.blob);
  preview.src = previewUrl;
  lastCapturedResult = result;
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  $("result-meta").textContent = t("ui_capture_metadata", { width: result.width, height: result.height, size: (result.blob.size / 1024 / 1024).toFixed(2) });
  $("result-label").textContent = result.captureTarget === "visible" ? t("ui_visible_area_captured") : t("ui_completed_capture");
  $("capture-warning").textContent = result.warning || "";
  $("capture-warning").hidden = !result.warning;
  $("capture-internal-button").hidden = !(result.captureTarget === "visible" && result.warning);
}

function errorMessage(error) { return error instanceof Error ? error.message : t("ui_the_operation_failed"); }

async function deliver(mode, result) {
  if (mode === "edit") {
    setPhase("opening-editor"); setStatus(t("ui_opening_editor"));
    await openEditorForCapture(result);
    setStatus(t("ui_editor_opened_with_the_original_png"));
  } else if (mode === "copy") {
    setPhase("exporting"); setStatus(t("ui_copying_original_png"));
    try {
      await copyScreenshot(result.blob);
      setStatus(result.captureTarget === "visible" ? t("ui_visible_area_screenshot_copied")
        : result.captureTarget === "internal" ? t("ui_scrollable_area_screenshot_copied") : t("ui_full_page_screenshot_copied"));
    }
    catch (error) { setStatus(t("ui_copy_failed_value1_retry_copy_or_save_the_completed_png", { value1: errorMessage(error) })); }
  } else {
    setPhase("exporting");
    downloadBlob(result.blob, result.filename); setStatus(t("ui_png_save_started"));
  }
}

async function runCapture(mode) {
  if (phase !== "idle" || initializing) return;
  const target = captureTarget.value;
  lastMode = mode;
  $("capture-visible-button").hidden = true;
  activeController = new AbortController();
  const controller = activeController;
  setPhase("capturing");
  if (lastCapturedResult) $("result-label").textContent = t("ui_previous_capture_kept_until_a_new_capture_succeeds");
  setStatus(t("ui_preparing_capture"));
  let captured = false;
  try {
    let clipboardReady = true;
    if (mode === "copy") {
      setStatus(t("ui_requesting_clipboard_permission"));
      clipboardReady = await prepareClipboard();
    }
    const result = await captureScreenshot({ signal: controller.signal, target,
      onProgress: ({ message, current, total, phase: capturePhase }) => setStatus(message,
        capturePhase === "capturing" && total ? current / total * 82 : capturePhase === "processing" ? 90 : 4),
    });
    if (controller.signal.aborted) return;
    showResult(result);
    captured = true;
    if (mode === "copy" && !clipboardReady) {
      setStatus(t("ui_clipboard_permission_was_not_granted_retry_copy_or_save_the_completed_png"));
    } else await deliver(mode, result);
  } catch (error) {
    const cancelled = error?.code === "cancelled" || controller.signal.aborted;
    const protectedPage = ["protected-page", "no-active-tab"].includes(error?.code);
    $("capture-visible-button").hidden = captured || cancelled || protectedPage || target === "visible";
    setStatus(cancelled ? t("ui_capture_cancelled_the_page_was_restored")
      : captured ? t(mode === "edit" ? "ui_editor_open_failed" : "ui_export_failed", { detail: errorMessage(error) })
        : t("ui_capture_failed_value1_value2", { value1: errorMessage(error), value2: lastCapturedResult ? t("ui_previous_available") : "" }));
  } finally { activeController = null; setPhase("idle"); }
}

async function useResult(mode) {
  if (phase !== "idle" || !lastCapturedResult) return;
  const permission = mode === "copy" ? prepareClipboard() : Promise.resolve(true);
  setPhase(mode === "edit" ? "opening-editor" : "exporting");
  try {
    if (!(await permission)) throw new Error(t("ui_clipboard_permission_was_not_granted_save_the_completed_png_instead"));
    await deliver(mode, lastCapturedResult);
  } catch (error) { setStatus(errorMessage(error)); }
  finally { setPhase("idle"); }
}

for (const mode of ["copy", "save", "edit"]) {
  $(`${mode}-button`).addEventListener("click", () => void runCapture(mode));
  $(`${mode}-result-button`).addEventListener("click", () => void useResult(mode));
}
$("capture-again-button").addEventListener("click", () => {
  $("capture-actions").hidden = false;
  $("capture-area-help").hidden = false;
  $("edit-button").focus();
  setStatus(t("ui_choose_how_to_use_your_next_capture_the_previous_png_stays_available"));
});
$("cancel-button").addEventListener("click", () => activeController?.abort());
for (const target of ["visible", "internal"]) {
  $(`capture-${target}-button`).addEventListener("click", () => {
    captureTarget.value = target;
    captureTarget.dispatchEvent(new Event("change", { bubbles: true }));
    void runCapture(lastMode);
  });
}
captureTarget.addEventListener("change", () => {
  updateAreaHelp();
  const revision = ++settingsRevision;
  pendingSettings++;
  const target = captureTarget.value;
  void queueSettingsSave({ captureTarget: target }).then(() => {
    savedTarget = target;
    if (revision === settingsRevision) $("settings-status").textContent = "";
  }).catch(() => {
    if (revision !== settingsRevision) return;
    $("settings-status").textContent = t("ui_preference_could_not_be_saved_you_can_still_capture_the_area_selected_here");
  }).finally(() => { pendingSettings--; });
});
getApi().storage?.onChanged?.addListener((changes, area) => {
  if (area !== "local" || !changes.captureTarget) return;
  savedTarget = ["internal", "visible"].includes(changes.captureTarget.newValue) ? changes.captureTarget.newValue : "page";
  if (phase === "idle" && !pendingSettings) { captureTarget.value = savedTarget; updateAreaHelp(); }
});

initializeUi();
void initializeFooter();
void pruneTemporaryCaptures();
void (async () => {
  try {
    const settings = await loadSettings();
    savedTarget = settings.captureTarget; captureTarget.value = savedTarget; updateAreaHelp();
    await queueSettingsSave(settings);
  } catch { $("settings-status").textContent = t("ui_settings_are_unavailable_capture_uses_the_area_selected_here"); }
  finally { initializing = false; setPhase("idle"); document.documentElement.dataset.koalashotReady = "true"; }
})();
window.addEventListener("pagehide", () => { activeController?.abort(); if (previewUrl) URL.revokeObjectURL(previewUrl); });
