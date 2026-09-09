import "./locale.js";

// English is the only shipping locale. Keep selection independent of browser language.
export const { t, language } = globalThis.koalaShotLocale;

export function localize(root = document) {
  root.documentElement?.setAttribute("lang", language);
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const attribute of ["title", "aria-label", "placeholder", "alt"]) {
    for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    }
  }
}
