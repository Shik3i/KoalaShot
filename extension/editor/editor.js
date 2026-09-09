import { initializeUi } from "../common/ui.js";
import { t } from "../common/i18n.js";
import { getApi, ensureClipboardPermission } from "../common/browser-api.js";
import { copyPngBlob } from "../common/clipboard.js";
import { deleteCapture, getCapture, makeCaptureId, saveCapture, pruneExpiredCaptures, saveCaptureDraft, subscribeCaptureDeletion, subscribeCaptureUpdates } from "../common/capture-store.js";
import { initializeFooter } from "../common/product-links.js";
import { downloadBlob } from "../popup/capture-controller.js";
import { makeEditedFilename, normalizePngFilename } from "../common/filename.js";
import { TEMP_CAPTURE_TTL_MS } from "../common/constants.js";
import {
  createAnnotation,
  cloneAnnotation,
  moveAnnotation,
  updateAnnotationStyle,
  validateAnnotations,
  tryValidateAnnotations,
  tryValidateCrop,
} from "./annotation-model.js";
import {
  annotationBounds,
  boundsIntersectViewport,
  drawAnnotation,
  drawSelection,
  hitTestAnnotation,
  normalizeRectangle,
  reducePoints,
} from "./geometry.js";
import { DocumentHistory } from "./history.js";
import { resizeHandles, resizeAnnotation } from "./resize.js";
import { renderEditorResultBlob, drawEditorAnnotations, clearEffectCache } from "./editor-export.js";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const TOOL_LABELS = Object.freeze({
  select: [t("ui_select"), t("ui_select_move_or_edit_an_annotation")],
  pan: [t("ui_pan"), t("ui_drag_the_screenshot_to_move_around")],
  pen: [t("ui_pen"), t("ui_draw_a_rounded_freehand_stroke")],
  highlighter: [t("ui_highlighter"), t("ui_draw_a_broad_translucent_highlight")],
  arrow: [t("ui_arrow"), t("ui_drag_to_draw_an_arrow")],
  line: [t("ui_line"), t("ui_drag_to_draw_a_straight_line")],
  rectangle: [t("ui_rectangle"), t("ui_drag_to_outline_a_rectangle")],
  ellipse: [t("ui_ellipse"), t("ui_drag_to_outline_an_ellipse")],
  text: [t("ui_text"), t("ui_click_the_image_to_add_multiline_text")],
  redact: [t("ui_redact"), t("ui_drag_an_opaque_rectangle_over_sensitive_pixels")],
  pixelate: [t("ui_pixelate"), t("ui_drag_over_pixels_that_should_be_visibly_pixelated")],
  blur: [t("ui_blur"), t("ui_drag_over_pixels_that_should_receive_a_cosmetic_blur")],
  marker: [t("ui_marker"), t("ui_click_to_place_the_next_numbered_marker")],
  crop: [t("ui_crop"), t("ui_drag_a_crop_area_then_apply_it_to_exports")],
});
const SHORTCUTS = Object.freeze({ v: "select", p: "pen", h: "highlighter", a: "arrow", l: "line", r: "rectangle", e: "ellipse", t: "text", x: "redact", i: "pixelate", b: "blur", m: "marker", c: "crop" });

const loadingState = document.querySelector("#loading-state");
const errorState = document.querySelector("#error-state");
const errorMessage = document.querySelector("#error-message");
const stageWrap = document.querySelector("#stage-wrap");
const stageScroll = document.querySelector("#stage-scroll");
const stage = document.querySelector("#stage");
const image = document.querySelector("#capture-image");
const overlay = document.querySelector("#interaction-canvas");
const textEditor = document.querySelector("#text-editor");
const textInput = document.querySelector("#text-input");
const sourceHostname = document.querySelector("#source-hostname");
const captureMeta = document.querySelector("#capture-meta");
const status = document.querySelector("#status");
const zoomValue = document.querySelector("#zoom-value");
const activeToolName = document.querySelector("#active-tool-name");
const contextHelp = document.querySelector("#context-help");
const colorControls = document.querySelector("#color-controls");
const strokeControl = document.querySelector("#stroke-width");
const strokeValue = document.querySelector("#stroke-width-value");
const fontControl = document.querySelector("#font-size");
const fontValue = document.querySelector("#font-size-value");
const annotationList = document.querySelector("#annotation-list");
const editTextButton = document.querySelector("#edit-text-button");
const cropControls = document.querySelector("#crop-controls");
const applyCropButton = document.querySelector("#apply-crop-button");
const resetCropButton = document.querySelector("#reset-crop-button");
const undoButton = document.querySelector("#undo-button");
const redoButton = document.querySelector("#redo-button");
const copyButton = document.querySelector("#copy-button");
const saveButton = document.querySelector("#save-button");
const discardButton = document.querySelector("#discard-button");
const deleteButton = document.querySelector("#delete-button");
const clearButton = document.querySelector("#clear-button");
const captureId = new URLSearchParams(location.search).get("capture");

let capture = null;
let imageUrl = null;
let zoom = 1;
let activeTool = "select";
let selectedId = "";
let transientAnnotation = null;
let transientCrop = null;
let cropSelection = null;
let pointerOperation = null;
let temporaryPan = false;
let textOperation = null;
let draftTimer = null;
let expiryTimer = null;
let draftSaveChain = Promise.resolve();
let pendingDraft = null;
let draftSaveRunning = false;
let discardInProgress = false;
let exportInProgress = false;
let lastRenderedExport = null;
let devicePixelRatioValue = globalThis.devicePixelRatio || 1;
let annotationColor = "#287a4a";
let strokeWidth = 6;
let fontSize = 32;
let markerRadius = 18;
let effectStrength = 10;
let draftRevision = 0;
let draftConflict = false;
let fitMode = false;
const writerId = makeCaptureId();
const draftStatus = document.querySelector("#draft-status");
const pendingNotice = document.querySelector("#pending-edits");
const conflictNotice = document.querySelector("#draft-conflict");

function setStatus(message) {
  status.textContent = message;
}

function showError(message) {
  loadingState.hidden = true;
  stageWrap.hidden = true;
  errorState.hidden = false;
  errorMessage.textContent = message;
  copyButton.disabled = true;
  saveButton.disabled = true;
  discardButton.disabled = !capture;
}

function setExportBusy(value) {
  exportInProgress = value;
  copyButton.disabled = value || !capture || draftConflict || !errorState.hidden;
  saveButton.disabled = value || !capture || draftConflict || !errorState.hidden;
  discardButton.disabled = value || !capture;
  if (!value && capture && !discardInProgress
    && Date.now() >= capture.createdAt + TEMP_CAPTURE_TTL_MS) {
    void expireOpenCapture();
  }
}

function hostnameFromUrl(sourceUrl) {
  try {
    return new URL(sourceUrl).hostname || t("ui_unknown_source");
  } catch {
    return t("ui_unknown_source");
  }
}

function formatMetadata(record, crop = null) {
  const width = crop ? Math.round(crop.width) : record.width;
  const height = crop ? Math.round(crop.height) : record.height;
  return t(crop ? "ui_editor_crop_metadata" : "ui_editor_metadata", { width, height });
}

function currentAnnotations() {
  return history.peekState().annotations;
}

function currentCrop() {
  return history.peekState().crop;
}

function documentState(annotations = currentAnnotations(), crop = currentCrop()) {
  return { annotations, crop };
}

function draftJournalKey() {
  return `koalashot-editor-draft:${captureId || "unknown"}`;
}

function writeDraftJournal(state) {
  const serialized = JSON.stringify({ ...state, baseRevision: draftRevision });
  try {
    globalThis.sessionStorage.setItem(draftJournalKey(), serialized);
  } catch {
    setStatus(t("ui_the_tab_local_draft_journal_is_full_save_or_copy_the_edited_png_now"));
  }
  return serialized;
}

function queueDraftWrite() {
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    draftTimer = null;
    startDraftSave();
  }, 250);
}

function scheduleDraftSave() {
  if (!capture || discardInProgress || draftConflict) {
    return;
  }
  const state = { annotations: currentAnnotations(), crop: currentCrop() };
  pendingDraft = { record: { ...capture, ...state }, journal: writeDraftJournal(state) };
  draftStatus.textContent = t("ui_saving_draft");
  queueDraftWrite();
}

function startDraftSave() {
  if (draftSaveRunning || !pendingDraft || discardInProgress || draftConflict) {
    return;
  }
  const draft = pendingDraft;
  pendingDraft = null;
  draftSaveRunning = true;
  draftSaveChain = persistDraft(draft).finally(() => {
    draftSaveRunning = false;
    if (pendingDraft && !discardInProgress && !draftConflict) {
      queueDraftWrite();
    }
  });
}

async function flushDraftSave() {
  if (!capture || discardInProgress || draftConflict) return draftSaveChain;
  window.clearTimeout(draftTimer);
  draftTimer = null;
  while ((pendingDraft || draftSaveRunning) && !discardInProgress && !draftConflict) {
    if (!draftSaveRunning) startDraftSave();
    await draftSaveChain;
  }
}

async function persistDraft(draft) {
  if (!draft) {
    return;
  }
  try {
    validateAnnotations(draft.record.annotations);
    draftRevision = await saveCaptureDraft(draft.record.id, draft.record.annotations, draft.record.crop, draftRevision, writerId);
    if (capture) capture.revision = draftRevision;
    if (globalThis.sessionStorage.getItem(draftJournalKey()) === draft.journal) {
      globalThis.sessionStorage.removeItem(draftJournalKey());
    }
    if (pendingDraft) pendingDraft.journal = writeDraftJournal({ annotations: pendingDraft.record.annotations, crop: pendingDraft.record.crop });
    draftStatus.textContent = pendingDraft ? t("ui_saving_draft") : t("ui_draft_saved_locally");
  } catch (error) {
    if (error?.code === "capture-unavailable") { invalidateCapture(error.message); return; }
    if (error?.code === "draft-conflict") { showDraftConflict(); return; }
    draftStatus.textContent = t("ui_draft_not_saved_keep_this_tab_open");
    const detail = error instanceof Error ? error.message : t("ui_local_storage_failed");
    setStatus(t("ui_draft_could_not_be_saved_locally_detail_your_current_editor_state_remains_available", { detail: detail }));
  }
}

function historyChanged() {
  lastRenderedExport = null;
  updateHistoryButtons();
  updateContextControls();
  drawOverlay();
  if (capture) {
    captureMeta.textContent = formatMetadata(capture, currentCrop());
  }
  scheduleDraftSave();
}

const history = new DocumentHistory({ annotations: [], crop: null }, { limit: 100, onChange: historyChanged });

function annotationOptionLabel(annotation, index) {
  const name = TOOL_LABELS[annotation.type]?.[0] || t("ui_annotation");
  if (annotation.type === "text") {
    const text = annotation.text.replace(/\s+/g, " ").trim().slice(0, 32);
    return `${index + 1}. ${name}: ${text}`;
  }
  if (annotation.type === "marker") {
    return `${index + 1}. ${name} ${annotation.number}`;
  }
  return `${index + 1}. ${name}`;
}

function updateAnnotationList() {
  const annotations = currentAnnotations();
  if (selectedId && !annotations.some((annotation) => annotation.id === selectedId)) {
    selectedId = "";
  }
  annotationList.replaceChildren();
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = annotations.length ? t("ui_none_selected") : t("ui_no_annotations");
  annotationList.appendChild(emptyOption);
  annotations.forEach((annotation, index) => {
    const option = document.createElement("option");
    option.value = annotation.id;
    option.textContent = annotationOptionLabel(annotation, index);
    annotationList.appendChild(option);
  });
  annotationList.value = selectedId;
  const selection = selectedId ? t("ui_value1_selected", { value1: annotationOptionLabel(selectedAnnotation(), annotations.findIndex(annotation => annotation.id === selectedId)) }) : "";
  overlay.setAttribute("aria-label", t(annotations.length === 1 ? "ui_annotation_count_one" : "ui_annotation_count_other", { count: annotations.length, selection }));
}

function updateHistoryButtons() {
  updateAnnotationList();
  undoButton.disabled = draftConflict || !history.canUndo;
  redoButton.disabled = draftConflict || !history.canRedo;
  const hasAnnotations = currentAnnotations().length > 0;
  clearButton.disabled = !hasAnnotations;
  deleteButton.disabled = !selectedId || !currentAnnotations().some((annotation) => annotation.id === selectedId);
  document.querySelector("#duplicate-button").disabled = deleteButton.disabled || currentAnnotations().length >= 5000;
}

function updateColorButtonState() {
  document.querySelectorAll(".swatch").forEach((swatch) => {
    const selected = swatch.dataset.color.toLowerCase() === annotationColor.toLowerCase();
    swatch.classList.toggle("is-selected", selected);
    swatch.setAttribute("aria-pressed", String(selected));
  });
}

function selectedAnnotation() {
  return currentAnnotations().find((annotation) => annotation.id === selectedId) || null;
}

function updateContextControls() {
  const selected = activeTool === "select" ? selectedAnnotation() : null;
  const styleTarget = selected || { type: activeTool };
  colorControls.hidden = !["pen", "highlighter", "arrow", "line", "rectangle", "ellipse", "text", "redact", "marker"].includes(styleTarget.type);
  const hasStroke = ["pen", "highlighter", "arrow", "line", "rectangle", "ellipse"].includes(styleTarget.type);
  const hasFont = styleTarget.type === "text";
  strokeControl.parentElement.hidden = !hasStroke;
  fontControl.parentElement.hidden = !hasFont;
  document.querySelector("#marker-size-control").hidden = styleTarget.type !== "marker";
  document.querySelector("#effect-strength-control").hidden = !["pixelate", "blur"].includes(styleTarget.type);
  if (selected?.radius) markerRadius = selected.radius;
  if (selected?.effectStrength) effectStrength = selected.effectStrength;
  document.querySelector("#marker-size").value = String(markerRadius);
  document.querySelector("#marker-size-value").textContent = String(markerRadius);
  document.querySelector("#effect-strength").value = String(effectStrength);
  document.querySelector("#effect-strength-value").textContent = String(effectStrength);
  editTextButton.hidden = !(selected?.type === "text");
  if (selected) {
    if (selected.color) {
      annotationColor = selected.color;
      updateColorButtonState();
      document.querySelector("#custom-color").value = selected.color;
    }
    if (selected.strokeWidth) {
      strokeWidth = selected.strokeWidth;
    }
    if (selected.fontSize) {
      fontSize = selected.fontSize;
    }
  }
  strokeControl.value = String(strokeWidth);
  strokeValue.textContent = String(strokeWidth);
  fontControl.value = String(fontSize);
  fontValue.textContent = String(fontSize);
  cropControls.hidden = activeTool !== "crop";
  const selectedCrop = cropSelection || currentCrop();
  applyCropButton.disabled = !selectedCrop || JSON.stringify(selectedCrop) === JSON.stringify(currentCrop());
  resetCropButton.disabled = !selectedCrop;
}

function selectTool(tool) {
  if (!TOOL_LABELS[tool]) {
    return;
  }
  if (tool !== activeTool && !applyPendingEdits()) return;
  if (tool !== activeTool && tool !== "select") selectedId = "";
  activeTool = tool;
  document.querySelectorAll("[data-tool]").forEach((button) => {
    const active = button.dataset.tool === tool;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  activeToolName.textContent = TOOL_LABELS[tool][0];
  contextHelp.textContent = TOOL_LABELS[tool][1];
  if (tool === "highlighter") {
    strokeWidth = 20;
  } else if (tool === "redact") {
    annotationColor = "#111111";
    document.querySelector("#custom-color").value = annotationColor;
    updateColorButtonState();
  }
  updateContextControls();
  updateHistoryButtons();
  drawOverlay();
}

function duplicateSelected() {
  if (!applyPendingEdits()) return;
  const selected = selectedAnnotation();
  if (!selected || draftConflict || currentAnnotations().length >= 5000) return;
  const copy = { ...moveAnnotation(selected, 16, 16), id: makeCaptureId() };
  if (copy.type === "marker") copy.number = nextMarkerNumber();
  history.apply(t("ui_duplicate_annotation"), documentState([...currentAnnotations(), copy]));
  selectedId = copy.id; selectTool("select"); updateHistoryButtons(); drawOverlay();
}

function getStageImageRect() {
  return image.getBoundingClientRect();
}

function getImagePoint(event) {
  const rect = getStageImageRect();
  return {
    x: (event.clientX - rect.left) / zoom,
    y: (event.clientY - rect.top) / zoom,
  };
}

function getViewportImageBounds() {
  const imageRect = getStageImageRect();
  const overlayRect = overlay.getBoundingClientRect();
  return {
    x: Math.max(0, (overlayRect.left - imageRect.left) / zoom),
    y: Math.max(0, (overlayRect.top - imageRect.top) / zoom),
    width: overlayRect.width / zoom,
    height: overlayRect.height / zoom,
  };
}

function resizeOverlay() {
  if (stageWrap.hidden) {
    return;
  }
  devicePixelRatioValue = globalThis.devicePixelRatio || 1;
  const width = Math.max(1, stageWrap.clientWidth);
  const height = Math.max(1, stageWrap.clientHeight);
  overlay.width = Math.round(width * devicePixelRatioValue);
  overlay.height = Math.round(height * devicePixelRatioValue);
  overlay.style.width = `${width}px`;
  overlay.style.height = `${height}px`;
  drawOverlay();
}

function drawOverlay() {
  if (!overlay.width || !capture) {
    return;
  }
  const context = overlay.getContext("2d");
  const imageRect = getStageImageRect();
  const overlayRect = overlay.getBoundingClientRect();
  const offsetX = imageRect.left - overlayRect.left;
  const offsetY = imageRect.top - overlayRect.top;
  const viewport = getViewportImageBounds();
  context.setTransform(devicePixelRatioValue * zoom, 0, 0, devicePixelRatioValue * zoom, devicePixelRatioValue * offsetX, devicePixelRatioValue * offsetY);
  context.clearRect(-offsetX / zoom, -offsetY / zoom, overlayRect.width / zoom, overlayRect.height / zoom);
  const previewAnnotations = currentAnnotations().map(annotation => transientAnnotation?.id === annotation.id ? transientAnnotation : annotation);
  const visible = previewAnnotations.filter((annotation) => boundsIntersectViewport(annotationBounds(annotation), viewport, 50));
  drawEditorAnnotations(context, visible, image);
  const selected = visible.find((annotation) => annotation.id === selectedId);
  drawSelection(context, selected);
  if (activeTool === "select") {
    context.save(); context.fillStyle = "#fff"; context.strokeStyle = "#287a4a"; context.lineWidth = 1.5 / zoom;
    for (const handle of resizeHandles(selected)) {
      context.fillRect(handle.x - 4 / zoom, handle.y - 4 / zoom, 8 / zoom, 8 / zoom);
      context.strokeRect(handle.x - 4 / zoom, handle.y - 4 / zoom, 8 / zoom, 8 / zoom);
    }
    context.restore();
  }
  if (transientAnnotation && !currentAnnotations().some(annotation => annotation.id === transientAnnotation.id)) {
    drawAnnotation(context, transientAnnotation);
  }
  const visibleCrop = transientCrop || cropSelection || currentCrop();
  if (visibleCrop) {
    context.save();
    context.fillStyle = "rgb(16 26 20 / 12%)";
    context.strokeStyle = "#287a4a";
    context.lineWidth = 3 / zoom;
    context.setLineDash?.([10 / zoom, 6 / zoom]);
    context.fillRect(visibleCrop.x, visibleCrop.y, visibleCrop.width, visibleCrop.height);
    context.strokeRect(visibleCrop.x, visibleCrop.y, visibleCrop.width, visibleCrop.height);
    context.restore();
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
}

function setZoom(nextZoom, anchorEvent = null) {
  fitMode = false;
  const target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
  if (!capture || target === zoom) {
    return;
  }
  const oldImageRect = getStageImageRect();
  const anchor = anchorEvent ? { x: anchorEvent.clientX, y: anchorEvent.clientY } : { x: oldImageRect.left + oldImageRect.width / 2, y: oldImageRect.top + oldImageRect.height / 2 };
  const imagePoint = { x: (anchor.x - oldImageRect.left) / zoom, y: (anchor.y - oldImageRect.top) / zoom };
  zoom = target;
  updateStageSize();
  const newImageRect = getStageImageRect();
  stageScroll.scrollLeft += (newImageRect.left + imagePoint.x * zoom) - anchor.x;
  stageScroll.scrollTop += (newImageRect.top + imagePoint.y * zoom) - anchor.y;
  zoomValue.textContent = `${Math.round(zoom * 100)}%`;
  drawOverlay();
}

function updateStageSize() {
  if (!capture) {
    return;
  }
  const width = Math.max(1, Math.round(capture.width * zoom));
  const height = Math.max(1, Math.round(capture.height * zoom));
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  image.style.width = `${width}px`;
  image.style.height = `${height}px`;
  image.width = width;
  image.height = height;
  window.requestAnimationFrame(() => {
    resizeOverlay();
    drawOverlay();
  });
}

function fitToWidth() {
  if (!capture) {
    return;
  }
  const availableWidth = Math.max(1, stageScroll.clientWidth - 44);
  setZoom(availableWidth / capture.width);
  fitMode = true;
}

function createCurrentAnnotation(start, end) {
  if (["line", "arrow"].includes(activeTool)) {
    return createAnnotation(activeTool, {
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
    }, { color: annotationColor, strokeWidth });
  }
  if (["rectangle", "ellipse", "redact", "pixelate", "blur"].includes(activeTool)) {
    const rectangle = normalizeRectangle(start, end);
    if (rectangle.width < 2 || rectangle.height < 2) {
      return null;
    }
    return createAnnotation(activeTool, rectangle, { color: activeTool === "redact" ? "#111111" : annotationColor, strokeWidth,
      ...(["pixelate", "blur"].includes(activeTool) ? { effectStrength } : {}) });
  }
  return null;
}

function clampCropToImage(rectangle) {
  if (!capture) {
    return null;
  }
  const left = Math.max(0, Math.min(capture.width - 1, rectangle.x));
  const top = Math.max(0, Math.min(capture.height - 1, rectangle.y));
  const right = Math.min(capture.width, Math.max(left + 1, rectangle.x + rectangle.width));
  const bottom = Math.min(capture.height, Math.max(top + 1, rectangle.y + rectangle.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function nextMarkerNumber() {
  return currentAnnotations().filter((annotation) => annotation.type === "marker")
    .reduce((maximum, annotation) => Math.max(maximum, annotation.number), 0) + 1;
}

function createMarker(point) {
  const marker = createAnnotation("marker", { x: point.x, y: point.y, radius: markerRadius }, {
    color: annotationColor,
    strokeWidth: Math.max(2, Math.min(12, strokeWidth)),
    number: nextMarkerNumber(),
  });
  history.apply(t("ui_create_marker"), documentState([...currentAnnotations(), marker]));
  selectedId = marker.id;
  updateHistoryButtons();
  drawOverlay();
}

function startPan(event) {
  pointerOperation = {
    kind: "pan",
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    scrollLeft: stageScroll.scrollLeft,
    scrollTop: stageScroll.scrollTop,
  };
  overlay.setPointerCapture?.(event.pointerId);
}

function startDrawing(event) {
  if (currentAnnotations().length >= 5000 && activeTool !== "crop") { setStatus(t("ui_the_editor_supports_at_most_5000_annotations_export_or_remove_some_annotations_first")); return; }
  const start = getImagePoint(event);
  if (activeTool === "marker") {
    createMarker(start);
    return;
  }
  if (activeTool === "text") {
    openTextEditor(start, null, event);
    return;
  }
  if (activeTool === "crop") {
    pointerOperation = { kind: "crop", pointerId: event.pointerId, start };
    transientCrop = null;
    overlay.setPointerCapture?.(event.pointerId);
    return;
  }
  pointerOperation = { kind: "draw", pointerId: event.pointerId, start, points: [start], before: null };
  if (activeTool === "pen" || activeTool === "highlighter") {
    pointerOperation.points = [start];
    transientAnnotation = null;
  }
  overlay.setPointerCapture?.(event.pointerId);
  drawOverlay();
}

function startSelection(event) {
  const point = getImagePoint(event);
  const selected = selectedAnnotation();
  const handle = resizeHandles(selected).find(item => Math.hypot(item.x - point.x, item.y - point.y) <= 9 / zoom);
  if (handle) {
    pointerOperation = { kind: "resize", handle: handle.name, pointerId: event.pointerId, before: cloneAnnotation(selected) };
    overlay.setPointerCapture?.(event.pointerId); return;
  }
  const annotations = currentAnnotations();
  const hit = [...annotations].reverse().find((annotation) => hitTestAnnotation(annotation, point, 10 / zoom));
  selectedId = hit?.id || "";
  updateHistoryButtons();
  updateContextControls();
  if (hit) {
    pointerOperation = { kind: "move", pointerId: event.pointerId, start: point, before: cloneAnnotation(hit), current: cloneAnnotation(hit) };
    overlay.setPointerCapture?.(event.pointerId);
  }
  drawOverlay();
}

function selectRelativeAnnotation(direction) {
  const annotations = currentAnnotations();
  if (annotations.length === 0) {
    return;
  }
  const currentIndex = annotations.findIndex((annotation) => annotation.id === selectedId);
  const nextIndex = currentIndex < 0
    ? direction > 0 ? 0 : annotations.length - 1
    : (currentIndex + direction + annotations.length) % annotations.length;
  selectedId = annotations[nextIndex].id;
  updateHistoryButtons();
  updateContextControls();
  setStatus(t("ui_selected_value1_value2_of_value3", { value1: TOOL_LABELS[annotations[nextIndex].type]?.[0] || t("ui_annotation"), value2: nextIndex + 1, value3: annotations.length }));
  drawOverlay();
}

function pointerDown(event) {
  if (!capture || draftConflict || discardInProgress) return;
  if (event.button !== 0 && event.pointerType === "mouse") {
    return;
  }
  overlay.focus({ preventScroll: true });
  if (temporaryPan || activeTool === "pan") {
    startPan(event);
  } else if (activeTool === "select") {
    startSelection(event);
  } else {
    startDrawing(event);
  }
}

function pointerMove(event) {
  if (!pointerOperation || pointerOperation.pointerId !== event.pointerId) {
    return;
  }
  if (pointerOperation.kind === "pan") {
    stageScroll.scrollLeft = pointerOperation.scrollLeft - (event.clientX - pointerOperation.clientX);
    stageScroll.scrollTop = pointerOperation.scrollTop - (event.clientY - pointerOperation.clientY);
    drawOverlay();
    return;
  }
  const point = getImagePoint(event);
  if (pointerOperation.kind === "move") {
    transientAnnotation = moveAnnotation(pointerOperation.before, point.x - pointerOperation.start.x, point.y - pointerOperation.start.y);
  } else if (pointerOperation.kind === "resize") {
    transientAnnotation = resizeAnnotation(pointerOperation.before, pointerOperation.handle, point);
  } else if (pointerOperation.kind === "crop") {
    transientCrop = clampCropToImage(normalizeRectangle(pointerOperation.start, point));
  } else if (pointerOperation.kind === "draw") {
    if (activeTool === "pen" || activeTool === "highlighter") {
      pointerOperation.points.push(point);
      transientAnnotation = createAnnotation(activeTool, { points: reducePoints(pointerOperation.points) }, {
        color: annotationColor,
        strokeWidth,
        opacity: 0.38,
      });
    } else {
      transientAnnotation = createCurrentAnnotation(pointerOperation.start, point);
    }
  }
  drawOverlay();
}

function pointerUp(event) {
  if (!pointerOperation || pointerOperation.pointerId !== event.pointerId) {
    return;
  }
  overlay.releasePointerCapture?.(event.pointerId);
  if (["move", "resize"].includes(pointerOperation.kind) && transientAnnotation) {
    history.apply(pointerOperation.kind === "resize" ? t("ui_resize_annotation") : t("ui_move_annotation"), documentState(currentAnnotations().map((annotation) => annotation.id === selectedId ? transientAnnotation : annotation)));
  } else if (pointerOperation.kind === "draw" && transientAnnotation) {
    if ((activeTool === "pen" || activeTool === "highlighter") && transientAnnotation.points.length < 2) {
      // A click is not a stroke.
    } else {
      history.apply(t("ui_create_activetool", { activeTool: activeTool }), documentState([...currentAnnotations(), transientAnnotation]));
      selectedId = transientAnnotation.id;
    }
  } else if (pointerOperation.kind === "crop") {
    if (transientCrop && transientCrop.width >= 4 && transientCrop.height >= 4) {
      cropSelection = transientCrop;
    }
    transientCrop = null;
  }
  pointerOperation = null;
  transientAnnotation = null;
  transientCrop = null;
  updateHistoryButtons();
  updateContextControls();
  updatePendingNotice();
  drawOverlay();
}

function pointerCancel(event) {
  if (!pointerOperation || pointerOperation.pointerId !== event.pointerId) {
    return;
  }
  overlay.releasePointerCapture?.(event.pointerId);
  pointerOperation = null;
  transientAnnotation = null;
  transientCrop = null;
  drawOverlay();
}

function deleteSelected() {
  if (!selectedId) {
    return;
  }
  const next = currentAnnotations().filter((annotation) => annotation.id !== selectedId);
  if (next.length !== currentAnnotations().length) {
    history.apply(t("ui_delete_annotation"), documentState(next));
    selectedId = "";
    updateHistoryButtons();
    drawOverlay();
  }
}

function clearAnnotations() {
  if (currentAnnotations().length === 0) {
    return;
  }
  history.apply(t("ui_clear_annotations"), documentState([]));
  selectedId = "";
  updateHistoryButtons();
  drawOverlay();
}

function applySelectedStyle(changes) {
  if (activeTool !== "select" || draftConflict) return;
  const selected = selectedAnnotation();
  if (!selected) {
    return;
  }
  const updated = updateAnnotationStyle(selected, changes);
  history.apply(t("ui_change_annotation_style"), documentState(currentAnnotations().map((annotation) => annotation.id === selected.id ? updated : annotation)));
}

function applyCrop() {
  if (!cropSelection) {
    return;
  }
  history.apply(t("ui_apply_crop"), documentState(currentAnnotations(), cropSelection));
  cropSelection = null;
  updatePendingNotice();
  updateContextControls();
  drawOverlay();
  captureMeta.textContent = formatMetadata(capture, currentCrop());
  setStatus(t("ui_crop_applied_to_edited_png_exports"));
}

function resetCrop() {
  cropSelection = null;
  history.apply(t("ui_reset_crop"), documentState(currentAnnotations(), null));
  if (capture) {
    captureMeta.textContent = formatMetadata(capture);
  }
  setStatus(t("ui_crop_reset_exports_use_the_full_screenshot"));
  updatePendingNotice(); updateContextControls(); drawOverlay();
}

function openTextEditor(point, existing, event = null) {
  if (textOperation && commitText() === false) return;
  if (existing) existing = currentAnnotations().find(annotation => annotation.id === existing.id) || existing;
  textOperation = { point, existing: existing ? cloneAnnotation(existing) : null };
  textInput.value = existing?.text || "";
  textEditor.hidden = false;
  const wrapRect = stageWrap.getBoundingClientRect();
  const left = Math.max(8, Math.min(wrapRect.width - 310, (event?.clientX || wrapRect.left + 20) - wrapRect.left));
  const top = Math.max(8, Math.min(wrapRect.height - 180, (event?.clientY || wrapRect.top + 20) - wrapRect.top));
  textEditor.style.left = `${left}px`;
  textEditor.style.top = `${top}px`;
  textInput.focus();
  updatePendingNotice();
}

function commitText() {
  if (!textOperation) {
    return;
  }
  const text = textInput.value;
  if (!text.trim()) {
    cancelText();
    return;
  }
  if (textOperation.existing) {
    const updated = { ...textOperation.existing, text };
    const next = currentAnnotations().map((annotation) => annotation.id === updated.id ? updated : annotation);
    try {
      history.apply(t("ui_edit_text"), documentState(next));
      selectedId = updated.id;
    } catch {
      setStatus(t("ui_that_text_annotation_could_not_be_saved"));
      return false;
    }
  } else {
    try {
      const annotation = createAnnotation("text", { x: textOperation.point.x, y: textOperation.point.y }, { text, color: annotationColor, fontSize });
      history.apply(t("ui_create_text"), documentState([...currentAnnotations(), annotation]));
      selectedId = annotation.id;
    } catch {
      setStatus(t("ui_that_text_annotation_could_not_be_created"));
      return false;
    }
  }
  textOperation = null;
  textEditor.hidden = true;
  updatePendingNotice();
  updateHistoryButtons();
  drawOverlay();
}

function cancelText() {
  textOperation = null;
  textEditor.hidden = true;
  updatePendingNotice();
}

function hasPendingEdits() {
  return Boolean(textOperation || pointerOperation || (cropSelection && JSON.stringify(cropSelection) !== JSON.stringify(currentCrop())));
}

function updatePendingNotice() {
  pendingNotice.hidden = !hasPendingEdits();
}

function applyPendingEdits() {
  if (pointerOperation) {
    setStatus(t("ui_finish_drawing_before_continuing_or_press_escape_to_cancel_the_unfinished_shape"));
    return false;
  }
  if (textOperation && commitText() === false) return false;
  if (cropSelection) applyCrop();
  return !hasPendingEdits();
}

function discardPendingEdits() {
  if (pointerOperation) {
    try { overlay.releasePointerCapture?.(pointerOperation.pointerId); } catch { /* Pointer may have ended. */ }
  }
  pointerOperation = null; transientAnnotation = null; transientCrop = null; cropSelection = null;
  textOperation = null; textEditor.hidden = true;
  updatePendingNotice(); updateContextControls(); drawOverlay();
}

function changeHistory(action) {
  if (draftConflict || !capture) return;
  const pending = hasPendingEdits();
  discardPendingEdits();
  if (pending) { setStatus(t("ui_pending_edit_discarded_saved_edits_are_unchanged")); return; }
  history[action]();
}

function editSelectedText() {
  const selected = selectedAnnotation();
  if (selected?.type === "text") {
    openTextEditor({ x: selected.x, y: selected.y }, selected);
  }
}

function handleDoubleClick(event) {
  if (activeTool !== "select") {
    return;
  }
  const point = getImagePoint(event);
  const hit = [...currentAnnotations()].reverse().find((annotation) => hitTestAnnotation(annotation, point, 10 / zoom));
  if (hit?.type === "text") {
    openTextEditor(point, hit, event);
  }
}

async function copyEdited() {
  if (!capture || !errorState.hidden || exportInProgress || draftConflict || !applyPendingEdits()) {
    return;
  }
  const permissionRequest = ensureClipboardPermission();
  const exportCapture = { ...capture, crop: currentCrop() };
  const exportAnnotations = currentAnnotations();
  const exportFilename = normalizePngFilename(document.querySelector("#export-filename").value, makeEditedFilename(capture.filename));
  const exportRevision = history.revision;
  setExportBusy(true);
  try {
    await flushDraftSave();
    await requireCurrentCapture();
    if (!(await permissionRequest)) {
      throw new Error(t("ui_clipboard_permission_was_not_granted"));
    }
    setStatus(t("ui_rendering_edited_png_for_clipboard"));
    const blob = await renderEditorResultBlob(exportCapture, exportAnnotations);
    await requireCurrentCapture();
    if (history.revision !== exportRevision) throw new Error(t("ui_the_image_changed_during_export_copy_again_to_include_your_latest_edits"));
    lastRenderedExport = { blob, filename: exportFilename, revision: exportRevision };
    await copyPngBlob(blob, getApi());
    setStatus(t("ui_edited_screenshot_copied"));
  } catch (error) {
    const fallback = lastRenderedExport ? t("ui_rendered_png_ready") : "";
    setStatus(t("ui_copy_failed_value1_fallback", { value1: error instanceof Error ? error.message : t("ui_clipboard_update_failed"), fallback: fallback }));
  } finally {
    setExportBusy(false);
  }
}

async function saveEdited() {
  if (!capture || !errorState.hidden || exportInProgress || draftConflict || !applyPendingEdits()) {
    return;
  }
  const exportCapture = { ...capture, crop: currentCrop() };
  const exportAnnotations = currentAnnotations();
  const exportFilename = normalizePngFilename(document.querySelector("#export-filename").value, makeEditedFilename(capture.filename));
  const exportRevision = history.revision;
  setExportBusy(true);
  try {
    await flushDraftSave();
    await requireCurrentCapture();
    let result = lastRenderedExport?.revision === exportRevision ? lastRenderedExport : null;
    if (!result) {
      setStatus(t("ui_rendering_edited_png_for_saving"));
      const blob = await renderEditorResultBlob(exportCapture, exportAnnotations);
      result = { blob, filename: exportFilename, revision: exportRevision };
    }
    await requireCurrentCapture();
    if (history.revision !== exportRevision) throw new Error(t("ui_the_image_changed_during_export_save_again_to_include_your_latest_edits"));
    lastRenderedExport = result;
    downloadBlob(result.blob, exportFilename);
    setStatus(t("ui_edited_png_save_started"));
  } catch (error) {
    setStatus(t("ui_save_failed_value1", { value1: error instanceof Error ? error.message : t("ui_edited_save_failed") }));
  } finally {
    setExportBusy(false);
  }
}

async function discardCapture() {
  if (!capture || discardInProgress) {
    return;
  }
  discardInProgress = true;
  window.clearTimeout(expiryTimer);
  expiryTimer = null;
  discardButton.disabled = true;
  window.clearTimeout(draftTimer);
  draftTimer = null;
  pendingDraft = null;
  try {
    await draftSaveChain;
    await deleteCapture(capture.id);
    globalThis.sessionStorage.removeItem(draftJournalKey());
  } catch {
    discardInProgress = false;
    discardButton.disabled = false;
    scheduleOpenCaptureExpiry();
    scheduleDraftSave();
    setStatus(t("ui_screenshot_could_not_be_discarded_locally_try_again"));
    return;
  }
  invalidateCapture(t("ui_the_temporary_screenshot_and_local_annotation_draft_were_discarded"));
  setStatus(t("ui_screenshot_discarded"));
  window.setTimeout(() => window.close(), 0);
}

async function expireOpenCapture() {
  if (!capture || discardInProgress || exportInProgress) {
    return;
  }
  discardInProgress = true;
  window.clearTimeout(draftTimer);
  draftTimer = null;
  pendingDraft = null;
  try {
    await draftSaveChain;
    await deleteCapture(capture.id);
    globalThis.sessionStorage.removeItem(draftJournalKey());
  } catch {
    discardInProgress = false;
    setStatus(t("ui_expired_screenshot_cleanup_failed_reopen_koalashot_to_retry_local_cleanup"));
    expiryTimer = window.setTimeout(() => void expireOpenCapture(), 30_000);
    return;
  }
  invalidateCapture(t("ui_this_temporary_screenshot_reached_its_24_hour_retention_limit_and_was_deleted_locally"));
  setStatus(t("ui_temporary_screenshot_expired_and_was_deleted"));
}

function scheduleOpenCaptureExpiry() {
  window.clearTimeout(expiryTimer);
  const remaining = Math.max(0, capture.createdAt + TEMP_CAPTURE_TTL_MS - Date.now());
  expiryTimer = window.setTimeout(() => void expireOpenCapture(), remaining);
}

function visibleImageCenter() {
  const viewport = getViewportImageBounds();
  return {
    x: Math.max(0, Math.min(capture.width, viewport.x + viewport.width / 2)),
    y: Math.max(0, Math.min(capture.height, viewport.y + viewport.height / 2)),
  };
}

function selectNextAnnotation() {
  const annotations = currentAnnotations();
  if (annotations.length === 0) {
    setStatus(t("ui_there_are_no_annotations_to_select"));
    return;
  }
  const index = annotations.findIndex((annotation) => annotation.id === selectedId);
  const next = annotations[(index + 1) % annotations.length];
  selectedId = next.id;
  updateHistoryButtons();
  updateContextControls();
  drawOverlay();
  setStatus(t("ui_value1_selected", { value1: annotationOptionLabel(next, (index + 1) % annotations.length) }));
}

function createKeyboardAnnotation() {
  if (currentAnnotations().length >= 5000 && !["select", "pan", "crop"].includes(activeTool)) { setStatus(t("ui_the_editor_supports_at_most_5000_annotations_export_or_remove_some_annotations_first")); return; }
  if (!capture || ["select", "pan"].includes(activeTool)) {
    if (activeTool === "select") {
      selectNextAnnotation();
    } else {
      setStatus(t("ui_pan_the_screenshot_with_the_arrow_keys_or_choose_an_annotation_tool"));
    }
    return;
  }
  const center = visibleImageCenter();
  if (activeTool === "text") {
    openTextEditor(center, null);
    return;
  }
  if (activeTool === "crop") {
    const viewport = getViewportImageBounds();
    cropSelection = clampCropToImage({
      x: viewport.x + viewport.width * 0.1,
      y: viewport.y + viewport.height * 0.1,
      width: viewport.width * 0.8,
      height: viewport.height * 0.8,
    });
    updateContextControls();
    drawOverlay();
    setStatus(t("ui_keyboard_crop_prepared_use_apply_crop_to_confirm_it"));
    updatePendingNotice();
    return;
  }
  if (activeTool === "marker") {
    createMarker(center);
    setStatus(t("ui_marker_added_at_the_visible_center"));
    return;
  }

  const halfWidth = Math.max(12, Math.min(80, capture.width / 8));
  const halfHeight = Math.max(12, Math.min(50, capture.height / 12));
  let annotation;
  if (activeTool === "pen" || activeTool === "highlighter") {
    annotation = createAnnotation(activeTool, { points: [
      { x: Math.max(0, center.x - halfWidth), y: center.y },
      { x: Math.min(capture.width, center.x + halfWidth), y: center.y },
    ] }, { color: annotationColor, strokeWidth, opacity: 0.38 });
  } else {
    annotation = createCurrentAnnotation(
      { x: Math.max(0, center.x - halfWidth), y: Math.max(0, center.y - halfHeight) },
      { x: Math.min(capture.width, center.x + halfWidth), y: Math.min(capture.height, center.y + halfHeight) },
    );
  }
  if (!annotation) {
    setStatus(t("ui_the_annotation_could_not_be_created_at_the_visible_center"));
    return;
  }
  history.apply(t("ui_create_activetool_with_keyboard", { activeTool: activeTool }), documentState([...currentAnnotations(), annotation]));
  selectedId = annotation.id;
  updateHistoryButtons();
  updateContextControls();
  drawOverlay();
  setStatus(t("ui_value1_added_at_the_visible_center", { value1: annotationOptionLabel(annotation, currentAnnotations().length - 1) }));
}

function moveSelectedWithKeyboard(key, largeStep) {
  const selected = selectedAnnotation();
  if (!selected) {
    return false;
  }
  const step = largeStep ? 10 : 1;
  const delta = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }[key];
  if (!delta) {
    return false;
  }
  const moved = moveAnnotation(selected, delta[0], delta[1]);
  history.apply(t("ui_move_annotation_with_keyboard"), documentState(currentAnnotations().map((annotation) => annotation.id === selected.id ? moved : annotation)));
  setStatus(t(step === 1 ? "ui_annotation_moved_one" : "ui_annotation_moved_other", { count: step }));
  return true;
}

function handleKeyboard(event) {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
  if (event.key === "Escape") {
    discardPendingEdits(); selectedId = "";
    updateHistoryButtons(); updateContextControls(); drawOverlay();
    return;
  }
  if (typing || !capture || !errorState.hidden || draftConflict || discardInProgress) {
    return;
  }
  if (target?.closest?.("button, select, a, summary") && !event.ctrlKey && !event.metaKey) return;
  if ((activeTool === "pan" || temporaryPan) && event.key.startsWith("Arrow")) {
    const step = event.shiftKey ? 200 : 50;
    stageScroll.scrollBy({ left: event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
      top: event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0 });
    event.preventDefault(); return;
  }
  if (event.target === overlay && event.key === "Enter") {
    event.preventDefault();
    createKeyboardAnnotation();
    return;
  }
  if (activeTool === "select" && event.target === overlay && moveSelectedWithKeyboard(event.key, event.shiftKey)) {
    event.preventDefault();
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    temporaryPan = true;
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelected();
    return;
  }
  if ((event.target === overlay || event.target === stageScroll) && ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    selectRelativeAnnotation(event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1);
    return;
  }
  const key = event.key.toLowerCase();
  if (SHORTCUTS[key] && !event.ctrlKey && !event.metaKey && !event.altKey) {
    selectTool(SHORTCUTS[key]);
    return;
  }
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && key === "d") {
    event.preventDefault(); duplicateSelected();
  } else if (modifier && key === "z") {
    event.preventDefault();
    if (event.shiftKey && event.metaKey) {
      changeHistory("redo");
    } else if (event.shiftKey && !event.metaKey) {
      changeHistory("redo");
    } else {
      changeHistory("undo");
    }
  } else if (modifier && key === "y") {
    event.preventDefault();
    changeHistory("redo");
  } else if (modifier && key === "+") {
    event.preventDefault();
    setZoom(zoom + ZOOM_STEP);
  } else if (modifier && key === "-") {
    event.preventDefault();
    setZoom(zoom - ZOOM_STEP);
  } else if (modifier && key === "0") {
    event.preventDefault();
    fitToWidth();
  }
}

function finishTemporaryPan() {
  temporaryPan = false;
}

document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => selectTool(button.dataset.tool)));
document.querySelectorAll(".swatch").forEach((button) => button.addEventListener("click", () => {
  annotationColor = button.dataset.color;
  document.querySelector("#custom-color").value = annotationColor;
  updateColorButtonState();
  applySelectedStyle({ color: annotationColor });
  updateContextControls();
}));
document.querySelector("#custom-color").addEventListener("input", (event) => {
  annotationColor = event.target.value;
  updateColorButtonState();
  applySelectedStyle({ color: annotationColor });
});
annotationList.addEventListener("change", () => {
  const requestedId = annotationList.value;
  if (!applyPendingEdits()) return;
  selectedId = requestedId;
  selectTool("select");
  updateHistoryButtons();
  updateContextControls();
  drawOverlay();
  const selected = selectedAnnotation();
  setStatus(selected ? t("ui_value1_selected", { value1: annotationOptionLabel(selected, currentAnnotations().findIndex((annotation) => annotation.id === selected.id)) }) : t("ui_annotation_selection_cleared"));
  overlay.focus({ preventScroll: true });
});
strokeControl.addEventListener("input", (event) => {
  strokeWidth = Number(event.target.value);
  strokeValue.textContent = String(strokeWidth);
  applySelectedStyle({ strokeWidth });
});
fontControl.addEventListener("input", (event) => {
  fontSize = Number(event.target.value);
  fontValue.textContent = String(fontSize);
  applySelectedStyle({ fontSize });
});
undoButton.addEventListener("click", () => changeHistory("undo"));
redoButton.addEventListener("click", () => changeHistory("redo"));
deleteButton.addEventListener("click", deleteSelected);
clearButton.addEventListener("click", clearAnnotations);
editTextButton.addEventListener("click", editSelectedText);
document.querySelector("#zoom-in-button").addEventListener("click", () => setZoom(zoom + ZOOM_STEP));
document.querySelector("#zoom-out-button").addEventListener("click", () => setZoom(zoom - ZOOM_STEP));
document.querySelector("#fit-button").addEventListener("click", fitToWidth);
document.querySelector("#actual-size-button").addEventListener("click", () => setZoom(1));
copyButton.addEventListener("click", () => void copyEdited());
saveButton.addEventListener("click", () => void saveEdited());
discardButton.addEventListener("click", () => void discardCapture());
applyCropButton.addEventListener("click", applyCrop);
resetCropButton.addEventListener("click", resetCrop);
document.querySelector("#apply-text-button").addEventListener("click", commitText);
document.querySelector("#cancel-text-button").addEventListener("click", cancelText);
textInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    cancelText();
  } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    commitText();
  }
});

overlay.addEventListener("pointerdown", pointerDown);
overlay.addEventListener("pointermove", pointerMove);
overlay.addEventListener("pointerup", pointerUp);
overlay.addEventListener("pointercancel", pointerCancel);
overlay.addEventListener("dblclick", handleDoubleClick);
overlay.addEventListener("wheel", (event) => {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    setZoom(zoom * (event.deltaY < 0 ? 1.1 : 0.9), event);
    return;
  }
  stageScroll.scrollBy({ left: event.deltaX, top: event.deltaY, behavior: "auto" });
  event.preventDefault();
}, { passive: false });
stageScroll.addEventListener("scroll", drawOverlay, { passive: true });
stageScroll.addEventListener("wheel", (event) => {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    setZoom(zoom * (event.deltaY < 0 ? 1.1 : 0.9), event);
  }
}, { passive: false });
window.addEventListener("keydown", handleKeyboard);
window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    finishTemporaryPan();
  }
});
window.addEventListener("resize", () => { if (fitMode) fitToWidth(); resizeOverlay(); });
window.addEventListener("blur", finishTemporaryPan);
window.addEventListener("pagehide", () => {
  unsubscribeDeletion();
  unsubscribeUpdates();
  window.clearTimeout(expiryTimer);
  void flushDraftSave();
  if (imageUrl) {
    URL.revokeObjectURL(imageUrl);
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    void flushDraftSave();
  } else if (capture) {
    void flushDraftSave().then(requireCurrentCapture).catch(() => {});
  }
});

image.addEventListener("load", () => {
  updateStageSize();
  if (!draftConflict) setStatus(t("ui_ready_edit_locally_then_copy_or_save_your_png"));
});
const unsubscribeDeletion = subscribeCaptureDeletion((ids) => {
  if (capture && ids.includes(capture.id) && !discardInProgress) invalidateCapture(t("ui_this_screenshot_was_deleted_in_another_koalashot_tab"));
});
const unsubscribeUpdates = subscribeCaptureUpdates(({ id, revision, writer }) => {
  if (capture?.id === id && writer !== writerId && revision > draftRevision) showDraftConflict();
});
initializeUi();
void initializeFooter();

document.querySelector("#marker-size").addEventListener("input", (event) => {
  markerRadius = Number(event.target.value); applySelectedStyle({ radius: markerRadius }); updateContextControls();
});
document.querySelector("#effect-strength").addEventListener("input", (event) => {
  effectStrength = Number(event.target.value); applySelectedStyle({ effectStrength }); updateContextControls();
});
document.querySelector("#apply-pending-button").addEventListener("click", () => {
  if (textOperation) commitText();
  if (cropSelection) applyCrop();
  updatePendingNotice();
});
document.querySelector("#discard-pending-button").addEventListener("click", discardPendingEdits);
document.querySelector("#load-latest-button").addEventListener("click", () => {
  globalThis.sessionStorage.removeItem(draftJournalKey()); location.reload();
});
document.querySelector("#keep-copy-button").addEventListener("click", () => void keepSeparateCopy(false));
document.querySelector("#duplicate-button").addEventListener("click", duplicateSelected);
document.querySelector("#recover-original-button").addEventListener("click", () => void keepSeparateCopy(true));

function showDraftConflict() {
  if (!capture || discardInProgress) return;
  draftConflict = true;
  window.clearTimeout(draftTimer); pendingDraft = null;
  conflictNotice.hidden = false;
  stageWrap.inert = true;
  document.querySelector(".tool-sidebar").inert = true;
  document.querySelector(".context-bar").inert = true;
  copyButton.disabled = true; saveButton.disabled = true;
  undoButton.disabled = true; redoButton.disabled = true;
  draftStatus.textContent = t("ui_draft_conflict_export_paused");
  setStatus(t("ui_changed_in_another_tab_load_the_latest_draft_or_keep_your_edits_as_a_separate_copy"));
}

async function keepSeparateCopy(originalOnly) {
  if (!originalOnly && !applyPendingEdits()) return;
  try {
    const source = originalOnly ? await getCapture(captureId, { allowInvalidDraft: true }) : capture;
    if (!source || Date.now() >= source.createdAt + TEMP_CAPTURE_TTL_MS) throw new Error(t("ui_the_capture_is_unavailable_or_expired"));
    const id = makeCaptureId();
    await saveCapture({ ...source, id, annotations: originalOnly ? [] : currentAnnotations(), crop: originalOnly ? null : currentCrop() });
    globalThis.sessionStorage.removeItem(draftJournalKey());
    location.replace(`editor.html?capture=${encodeURIComponent(id)}`);
  } catch (error) { setStatus(error.message); }
}
image.addEventListener("error", () => showError(t("ui_the_original_png_could_not_be_decoded_capture_the_page_again")));

function invalidateCapture(message) {
  discardInProgress = true;
  window.clearTimeout(draftTimer);
  window.clearTimeout(expiryTimer);
  pendingDraft = null; lastRenderedExport = null; capture = null;
  history.setCurrent({ annotations: [], crop: null }, { notify: false });
  clearEffectCache(image);
  try { globalThis.sessionStorage.removeItem(draftJournalKey()); } catch { /* Storage may be unavailable. */ }
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = null; image.removeAttribute("src");
  showError(message);
}

async function requireCurrentCapture() {
  let current;
  try { current = capture ? await getCapture(capture.id) : null; }
  catch (error) {
    if (error?.code === "draft-invalid") {
      showError(error.message);
      document.querySelector("#recover-original-button").hidden = false;
    }
    throw error;
  }
  if (!capture || Date.now() >= capture.createdAt + TEMP_CAPTURE_TTL_MS || !current) {
    invalidateCapture(t("ui_this_screenshot_was_deleted_or_expired_capture_the_page_again"));
    throw new Error(t("ui_the_temporary_screenshot_was_deleted_or_expired"));
  }
  if (draftConflict || current.revision !== draftRevision) {
    showDraftConflict();
    throw new Error(t("ui_the_draft_changed_in_another_tab_resolve_the_draft_conflict_before_exporting"));
  }
}

void (async () => {
  try {
    await pruneExpiredCaptures();
    if (!captureId) {
      showError(t("ui_no_temporary_capture_was_specified"));
      return;
    }
    capture = await getCapture(captureId);
    if (!capture) {
      globalThis.sessionStorage.removeItem(draftJournalKey());
      showError(t("ui_this_temporary_capture_was_not_found_or_has_expired"));
      return;
    }
    scheduleOpenCaptureExpiry();
    draftRevision = capture.revision;
    let journalConflict = false;
    let restoredJournal = false;
    const storedAnnotations = tryValidateAnnotations(capture.annotations || []);
    const storedCrop = tryValidateCrop(capture.crop || null);
    let state = {
      annotations: storedAnnotations.valid ? storedAnnotations.annotations : [],
      crop: storedCrop.valid ? storedCrop.crop : null,
    };
    try {
      const journal = JSON.parse(globalThis.sessionStorage.getItem(draftJournalKey()) || "null");
      const journalAnnotations = tryValidateAnnotations(journal?.annotations);
      const journalCrop = tryValidateCrop(journal?.crop);
      if (journalAnnotations.valid && journalCrop.valid) {
        state = { annotations: journalAnnotations.annotations, crop: journalCrop.crop };
        restoredJournal = true;
        journalConflict = (journal.baseRevision ?? 0) !== draftRevision;
      } else if (journal) {
        throw new Error(t("ui_the_tab_local_draft_is_damaged_export_is_disabled_recover_the_original_separately_if_"));
      }
    } catch {
      const error = new Error(t("ui_the_tab_local_draft_is_damaged_export_is_disabled_recover_the_original_separately_if_"));
      error.code = "draft-invalid"; throw error;
    }
    history.setCurrent(state, { notify: false });
    cropSelection = null;
    imageUrl = URL.createObjectURL(capture.blob);
    image.src = imageUrl;
    image.alt = capture.sourceTitle ? t("ui_original_screenshot_of_value1", { value1: capture.sourceTitle }) : t("ui_original_screenshot");
    sourceHostname.textContent = hostnameFromUrl(capture.sourceUrl);
    captureMeta.textContent = formatMetadata(capture, currentCrop());
    document.querySelector("#export-filename").value = makeEditedFilename(capture.filename);
    const notice = document.querySelector("#capture-warning");
    notice.textContent = capture.warning || "";
    notice.hidden = !capture.warning;
    loadingState.hidden = true;
    errorState.hidden = true;
    stageWrap.hidden = false;
    copyButton.disabled = false;
    saveButton.disabled = false;
    discardButton.disabled = false;
    updateHistoryButtons();
    updateContextControls();
    resizeOverlay();
    fitToWidth();
    draftStatus.textContent = t("ui_draft_saved_locally");
    if (journalConflict) showDraftConflict();
    else if (restoredJournal) scheduleDraftSave();
  } catch (error) {
    showError(error instanceof Error ? error.message : t("ui_the_temporary_screenshot_could_not_be_loaded"));
    document.querySelector("#recover-original-button").hidden = error?.code !== "draft-invalid";
  }
})();
