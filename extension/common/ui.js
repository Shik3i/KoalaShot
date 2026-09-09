import { localize } from "./i18n.js";

export function initializeUi() {
  localize();
  const tooltip = document.createElement("div");
  tooltip.id = "control-tooltip";
  tooltip.className = "control-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);
  let owner = null;
  let originalDescription = null;
  const hide = () => {
    if (owner) {
      if (originalDescription === null) owner.removeAttribute("aria-describedby");
      else owner.setAttribute("aria-describedby", originalDescription);
    }
    owner = null;
    tooltip.hidden = true;
  };
  const show = (element) => {
    if (!element || element === owner) return;
    hide();
    const message = element.dataset.tooltip || element.getAttribute("title");
    if (!message) return;
    element.dataset.tooltip = message;
    element.removeAttribute("title");
    owner = element;
    originalDescription = element.getAttribute("aria-describedby");
    element.setAttribute("aria-describedby", `${originalDescription || ""} control-tooltip`.trim());
    tooltip.textContent = message;
    tooltip.hidden = false;
    const rect = element.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - box.width - 8, rect.left))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - box.height - 8, rect.bottom + 6 + box.height <= window.innerHeight ? rect.bottom + 6 : rect.top - box.height - 6))}px`;
  };
  const control = target => target.closest?.("[title], [data-tooltip]");
  document.addEventListener("pointerover", event => show(control(event.target)));
  document.addEventListener("focusin", event => show(control(event.target)));
  document.addEventListener("pointerout", event => { if (owner && !owner.contains(event.relatedTarget)) hide(); });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !tooltip.hidden) {
      event.preventDefault();
      event.stopPropagation();
    }
    hide();
  }, true);
  document.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}
