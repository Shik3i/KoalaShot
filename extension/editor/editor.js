import { getApi, ensureClipboardPermission } from "../common/browser-api.js";
import { copyPngBlob } from "../common/clipboard.js";
import { deleteCapture, getCapture, pruneExpiredCaptures, saveCapture } from "../common/capture-store.js";
import { downloadBlob } from "../popup/capture-controller.js";
import { makeEditedFilename } from "../common/filename.js";
import {
  createAnnotation,
  cloneAnnotation,
  moveAnnotation,
  updateAnnotationStyle,
  validateAnnotations,
  tryValidateAnnotations,
} from "./annotation-model.js";
import {
  annotationBounds,
  boundsIntersectViewport,
  drawAnnotation,
  drawAnnotations,
  hitTestAnnotation,
  normalizeRectangle,
  reducePoints,
} from "./geometry.js";
import { AnnotationHistory } from "./history.js";
import { renderEditorResultBlob } from "./editor-export.js";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const TOOL_LABELS = Object.freeze({
  select: ["Select", "Select, move, or edit an annotation."],
  pan: ["Pan", "Drag the screenshot to move around."],
  pen: ["Pen", "Draw a rounded freehand stroke."],
  highlighter: ["Highlighter", "Draw a broad translucent highlight."],
  arrow: ["Arrow", "Drag to draw an arrow."],
  line: ["Line", "Drag to draw a straight line."],
  rectangle: ["Rectangle", "Drag to outline a rectangle."],
  text: ["Text", "Click the image to add multiline text."],
  redact: ["Redact", "Drag an opaque rectangle over sensitive pixels."],
});
const SHORTCUTS = Object.freeze({ v: "select", p: "pen", h: "highlighter", a: "arrow", l: "line", r: "rectangle", t: "text", x: "redact" });

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
const editTextButton = document.querySelector("#edit-text-button");
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
let pointerOperation = null;
let temporaryPan = false;
let textOperation = null;
let draftTimer = null;
let draftSaveChain = Promise.resolve();
let discardInProgress = false;
let devicePixelRatioValue = globalThis.devicePixelRatio || 1;
let annotationColor = "#287a4a";
let strokeWidth = 6;
let fontSize = 32;

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

function hostnameFromUrl(sourceUrl) {
  try {
    return new URL(sourceUrl).hostname || "Unknown source";
  } catch {
    return "Unknown source";
  }
}

function formatMetadata(record) {
  return `${record.width} × ${record.height}px`;
}

function currentAnnotations() {
  return history.getState();
}

function scheduleDraftSave() {
  if (discardInProgress) {
    return;
  }
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    draftTimer = null;
    draftSaveChain = draftSaveChain.then(() => persistDraft()).catch(() => {});
  }, 500);
}

async function persistDraft() {
  if (!capture) {
    return;
  }
  try {
    validateAnnotations(currentAnnotations());
    await saveCapture({ ...capture, annotations: currentAnnotations() });
  } catch {
    setStatus("Draft could not be saved locally; your current editor state remains available.");
  }
}

function historyChanged() {
  updateHistoryButtons();
  updateContextControls();
  drawOverlay();
  scheduleDraftSave();
}

const history = new AnnotationHistory([], { limit: 100, onChange: historyChanged });

function updateHistoryButtons() {
  undoButton.disabled = !history.canUndo;
  redoButton.disabled = !history.canRedo;
  const hasAnnotations = currentAnnotations().length > 0;
  clearButton.disabled = !hasAnnotations;
  deleteButton.disabled = !selectedId || !currentAnnotations().some((annotation) => annotation.id === selectedId);
}

function selectedAnnotation() {
  return currentAnnotations().find((annotation) => annotation.id === selectedId) || null;
}

function updateContextControls() {
  const selected = selectedAnnotation();
  const toolHasColor = ["pen", "highlighter", "arrow", "line", "rectangle", "text", "redact"].includes(activeTool);
  colorControls.hidden = !toolHasColor && !selected;
  const styleTarget = selected || { type: activeTool };
  const hasStroke = ["pen", "highlighter", "arrow", "line", "rectangle"].includes(styleTarget.type);
  const hasFont = styleTarget.type === "text";
  strokeControl.parentElement.hidden = !hasStroke;
  fontControl.parentElement.hidden = !hasFont;
  editTextButton.hidden = !(selected?.type === "text");
  if (selected) {
    if (selected.color) {
      annotationColor = selected.color;
      document.querySelectorAll(".swatch").forEach((swatch) => swatch.classList.toggle("is-selected", swatch.dataset.color.toLowerCase() === selected.color.toLowerCase()));
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
}

function selectTool(tool) {
  if (!TOOL_LABELS[tool]) {
    return;
  }
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
    document.querySelectorAll(".swatch").forEach((swatch) => swatch.classList.toggle("is-selected", swatch.dataset.color === annotationColor));
  }
  updateContextControls();
  drawOverlay();
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
  const visible = currentAnnotations().filter((annotation) => boundsIntersectViewport(annotationBounds(annotation), viewport, 50));
  drawAnnotations(context, visible, selectedId);
  if (transientAnnotation) {
    drawAnnotation(context, transientAnnotation);
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
}

function setZoom(nextZoom, anchorEvent = null) {
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
  if (activeTool === "rectangle" || activeTool === "redact") {
    const rectangle = normalizeRectangle(start, end);
    if (rectangle.width < 2 || rectangle.height < 2) {
      return null;
    }
    return createAnnotation(activeTool, rectangle, { color: activeTool === "redact" ? "#111111" : annotationColor, strokeWidth });
  }
  return null;
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
  const start = getImagePoint(event);
  if (activeTool === "text") {
    openTextEditor(start, null, event);
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

function pointerDown(event) {
  if (event.button !== 0 && event.pointerType === "mouse") {
    return;
  }
  stageScroll.focus({ preventScroll: true });
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
  if (pointerOperation.kind === "move" && transientAnnotation) {
    history.apply("Move annotation", currentAnnotations().map((annotation) => annotation.id === selectedId ? transientAnnotation : annotation));
  } else if (pointerOperation.kind === "draw" && transientAnnotation) {
    if ((activeTool === "pen" || activeTool === "highlighter") && transientAnnotation.points.length < 2) {
      // A click is not a stroke.
    } else {
      history.apply(`Create ${activeTool}`, [...currentAnnotations(), transientAnnotation]);
      selectedId = transientAnnotation.id;
    }
  }
  pointerOperation = null;
  transientAnnotation = null;
  updateHistoryButtons();
  updateContextControls();
  drawOverlay();
}

function pointerCancel(event) {
  if (!pointerOperation || pointerOperation.pointerId !== event.pointerId) {
    return;
  }
  overlay.releasePointerCapture?.(event.pointerId);
  pointerOperation = null;
  transientAnnotation = null;
  drawOverlay();
}

function deleteSelected() {
  if (!selectedId) {
    return;
  }
  const next = currentAnnotations().filter((annotation) => annotation.id !== selectedId);
  if (next.length !== currentAnnotations().length) {
    history.apply("Delete annotation", next);
    selectedId = "";
  }
}

function clearAnnotations() {
  if (currentAnnotations().length === 0) {
    return;
  }
  history.apply("Clear annotations", []);
  selectedId = "";
}

function applySelectedStyle(changes) {
  const selected = selectedAnnotation();
  if (!selected) {
    return;
  }
  const updated = updateAnnotationStyle(selected, changes);
  history.apply("Change annotation style", currentAnnotations().map((annotation) => annotation.id === selected.id ? updated : annotation));
}

function openTextEditor(point, existing, event = null) {
  textOperation = { point, existing: existing ? cloneAnnotation(existing) : null };
  textInput.value = existing?.text || "";
  textEditor.hidden = false;
  const wrapRect = stageWrap.getBoundingClientRect();
  const left = Math.max(8, Math.min(wrapRect.width - 310, (event?.clientX || wrapRect.left + 20) - wrapRect.left));
  const top = Math.max(8, Math.min(wrapRect.height - 180, (event?.clientY || wrapRect.top + 20) - wrapRect.top));
  textEditor.style.left = `${left}px`;
  textEditor.style.top = `${top}px`;
  textInput.focus();
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
      history.apply("Edit text", next);
      selectedId = updated.id;
    } catch {
      setStatus("That text annotation could not be saved.");
    }
  } else {
    try {
      const annotation = createAnnotation("text", { x: textOperation.point.x, y: textOperation.point.y }, { text, color: annotationColor, fontSize });
      history.apply("Create text", [...currentAnnotations(), annotation]);
      selectedId = annotation.id;
    } catch {
      setStatus("That text annotation could not be created.");
    }
  }
  textOperation = null;
  textEditor.hidden = true;
}

function cancelText() {
  textOperation = null;
  textEditor.hidden = true;
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
  try {
    if (!(await ensureClipboardPermission())) {
      throw new Error("Clipboard permission was not granted.");
    }
    setStatus("Rendering edited PNG for clipboard…");
    const blob = await renderEditorResultBlob(capture, currentAnnotations());
    await copyPngBlob(blob, getApi());
    setStatus("Edited screenshot copied.");
  } catch (error) {
    setStatus(`Copy failed: ${error instanceof Error ? error.message : "The clipboard could not be updated."}`);
  }
}

async function saveEdited() {
  try {
    setStatus("Rendering edited PNG for saving…");
    const blob = await renderEditorResultBlob(capture, currentAnnotations());
    downloadBlob(blob, makeEditedFilename(capture.filename));
    setStatus("Edited PNG save started.");
  } catch (error) {
    setStatus(`Save failed: ${error instanceof Error ? error.message : "The edited PNG could not be saved."}`);
  }
}

async function discardCapture() {
  if (!capture || discardInProgress) {
    return;
  }
  discardInProgress = true;
  discardButton.disabled = true;
  window.clearTimeout(draftTimer);
  try {
    await draftSaveChain;
    await deleteCapture(capture.id);
  } catch {
    discardInProgress = false;
    discardButton.disabled = false;
    setStatus("Screenshot could not be discarded locally; try again.");
    return;
  }
  capture = null;
  if (imageUrl) {
    URL.revokeObjectURL(imageUrl);
    imageUrl = null;
  }
  stageWrap.hidden = true;
  errorState.hidden = false;
  errorMessage.textContent = "The temporary screenshot and local annotation draft were discarded.";
  copyButton.disabled = true;
  saveButton.disabled = true;
  setStatus("Screenshot discarded.");
  window.setTimeout(() => window.close(), 0);
}

function handleKeyboard(event) {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
  if (event.key === "Escape") {
    if (!textEditor.hidden) {
      cancelText();
    } else if (pointerOperation) {
      pointerOperation = null;
      transientAnnotation = null;
      drawOverlay();
    } else {
      selectedId = "";
      updateHistoryButtons();
      drawOverlay();
    }
    return;
  }
  if (typing) {
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
  const key = event.key.toLowerCase();
  if (SHORTCUTS[key]) {
    selectTool(SHORTCUTS[key]);
    return;
  }
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && key === "z") {
    event.preventDefault();
    if (event.shiftKey && event.metaKey) {
      history.redo();
    } else if (event.shiftKey && !event.metaKey) {
      history.redo();
    } else {
      history.undo();
    }
  } else if (modifier && key === "y") {
    event.preventDefault();
    history.redo();
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
  document.querySelectorAll(".swatch").forEach((swatch) => swatch.classList.toggle("is-selected", swatch === button));
  applySelectedStyle({ color: annotationColor });
  updateContextControls();
}));
document.querySelector("#custom-color").addEventListener("input", (event) => {
  annotationColor = event.target.value;
  document.querySelectorAll(".swatch").forEach((swatch) => swatch.classList.remove("is-selected"));
  applySelectedStyle({ color: annotationColor });
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
undoButton.addEventListener("click", () => history.undo());
redoButton.addEventListener("click", () => history.redo());
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
window.addEventListener("resize", resizeOverlay);
window.addEventListener("pagehide", () => {
  window.clearTimeout(draftTimer);
  if (imageUrl) {
    URL.revokeObjectURL(imageUrl);
  }
});

image.addEventListener("load", () => {
  updateStageSize();
  setStatus("Ready. Original screenshot is immutable; annotations are stored locally as a draft.");
});

void (async () => {
  try {
    await pruneExpiredCaptures();
    if (!captureId) {
      showError("No temporary capture was specified.");
      return;
    }
    capture = await getCapture(captureId);
    if (!capture) {
      showError("This temporary capture was not found or has expired.");
      return;
    }
    const draft = tryValidateAnnotations(capture.annotations || []);
    history.setCurrent(draft.valid ? draft.annotations : [], { notify: false });
    imageUrl = URL.createObjectURL(capture.blob);
    image.src = imageUrl;
    image.alt = capture.sourceTitle ? `Original full-page screenshot of ${capture.sourceTitle}` : "Original full-page screenshot";
    sourceHostname.textContent = hostnameFromUrl(capture.sourceUrl);
    captureMeta.textContent = formatMetadata(capture);
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
  } catch (error) {
    showError(error instanceof Error ? error.message : "The temporary screenshot could not be loaded.");
  }
})();
