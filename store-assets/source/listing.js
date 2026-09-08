const params = new URLSearchParams(location.search);
const browser = params.get("browser") === "firefox" ? "firefox" : "chrome";
const browserName = browser === "firefox" ? "Firefox" : "Chrome";
const kind = params.get("kind");
const slides = [
  ["CAPTURE", "The whole page.\nOne PNG.", "Keep a long webpage in one image, ready to save or edit.", "Full page or a scrollable area inside the page.", "editor-full-page"],
  ["YOUR NEXT STEP", "Copy. Save.\nEdit if needed.", "Choose your output before capture. Reuse the result while the popup stays open.", "Direct Copy and Save skip the editor.", "popup"],
  ["ANNOTATE", "Show what\nyou mean.", "Point to a change. Add a note. Number the details that matter.", "Arrows, shapes, text, highlights and numbered markers.", "editor-annotated"],
  ["REDACT", "Cover private\ndetails.", "Use Redact to cover sensitive information in the PNG you export.", "The temporary original remains until discarded or expired. Blur and Pixelate are cosmetic.", "editor-redact"],
  ["CROP", "Keep the part\nyou need.", "Select an area, apply the crop, then copy or save the result.", "Edits are local. Undo is there when you change your mind.", "editor-crop"],
];
const index = Math.max(0, Math.min(4, Number(params.get("slide") || 1) - 1));
const [step, headline, description, detail, file] = slides[index];
document.querySelector("#step").textContent = `${String(index + 1).padStart(2, "0")} / ${step}`;
document.querySelector("#headline").textContent = headline;
document.querySelector("#description").textContent = description;
document.querySelector("#detail").textContent = detail;
document.querySelector("#caption").textContent = `Actual ${browserName} interface · Fictional example page`;
const screens = document.querySelector("#screens");
if (kind === "promo" || kind === "marquee") {
  document.querySelector("#artwork").className = kind;
  document.querySelector("#headline").textContent = kind === "promo" ? "Full-page\nscreenshots." : "Full-page screenshots.\nReady for your notes.";
  document.querySelector("#description").textContent = "Capture, annotate and save. On your device.";
  const icon = document.createElement("img"); icon.src = "../../extension/icons/icon-master.png"; icon.className = "mascot"; icon.alt = "KoalaShot camera mascot"; screens.append(icon);
} else if (file === "popup") {
  screens.className = "popup-pair";
  const evidence = await (await fetch(`../screenshots/${browser}-capture-evidence.json`)).json();
  for (const [suffix, label] of [["popup-capture", "Choose an action"], ["popup-result", "Reuse your capture"]]) {
    const name = `${browser}-${suffix}.png`;
    const shot = evidence.screenshots.find(item => item.file === name);
    if (!shot || !(shot.contentHeight > 100 && shot.contentHeight <= 800)) throw new Error(`Missing popup dimensions: ${name}`);
    const column = document.createElement("div"); const caption = document.createElement("p"); caption.className = "popup-label"; caption.textContent = label;
    const crop = document.createElement("div"); crop.className = "popup-wrap"; crop.style.height = `${Math.ceil(shot.contentHeight)}px`;
    const img = document.createElement("img"); img.src = `../screenshots/${name}`; img.alt = label; crop.append(img); column.append(caption,crop); screens.append(column);
  }
  document.querySelector("#caption").textContent = `Actual ${browserName} popup content · Cropped from popup pages opened as tabs`;
} else {
  const img = document.createElement("img"); img.className = "screen"; img.src = `../screenshots/${browser}-${file}.png`; img.alt = `KoalaShot ${step.toLowerCase()} view`; screens.append(img);
}
await document.fonts.ready;
await Promise.all([...document.images].map(img => img.decode()));
document.documentElement.dataset.ready = "true";
