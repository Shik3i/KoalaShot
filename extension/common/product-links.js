export const PRIVACY_URL = "https://shot.koalastuff.net/privacy/";
export const LEGAL_URL = "https://koalastuff.net/imprint";
export const SUPPORT_URL = "https://github.com/Shik3i/KoalaShot/issues";

export function validStoreUrl(raw, browser) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const valid = browser === "chrome"
      ? url.hostname === "chromewebstore.google.com" && /^\/detail\/[^/]+\/[a-p]{32}\/?$/.test(url.pathname)
      : browser === "firefox" && url.hostname === "addons.mozilla.org" && /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?firefox\/addon\/[^/]+\/?$/.test(url.pathname);
    if (!valid) return null;
    url.search = ""; url.hash = "";
    return url.href;
  } catch { return null; }
}

export function reviewUrl(raw, browser) {
  const url = validStoreUrl(raw, browser);
  return url ? `${url.replace(/\/$/, "")}/reviews${browser === "firefox" ? "/" : ""}` : null;
}

export async function initializeFooter() {
  const footer = document.querySelector("[data-product-footer]");
  if (!footer) return;
  const identity = document.createElement("div"); identity.className = "footer-identity";
  const brand = document.createElement("strong"); brand.textContent = "KoalaShot";
  const version = document.createElement("span");
  identity.append(brand, version);
  const note = document.createElement("span"); note.textContent = "Local capture. No uploads.";
  identity.append(note);
  const links = document.createElement("nav"); links.setAttribute("aria-label", "KoalaShot support");
  for (const [label, href] of [["Privacy", PRIVACY_URL], ["Legal", LEGAL_URL], ["Help", SUPPORT_URL]]) {
    const link = document.createElement("a"); link.textContent = label; link.href = href;
    link.target = "_blank"; link.rel = "noopener noreferrer"; links.append(link);
  }
  const rating = document.createElement("span"); rating.className = "review-pending";
  rating.textContent = "Reviews after store launch"; links.append(rating);
  footer.replaceChildren(identity, links);
  try {
    const response = await fetch(new URL("product.json", import.meta.url));
    if (!response.ok) return;
    const metadata = await response.json();
    version.textContent = metadata.version ? `v${metadata.version}` : "";
    const browser = typeof (globalThis.browser || globalThis.chrome)?.runtime?.getBrowserInfo === "function" ? "firefox" : "chrome";
    const href = reviewUrl(metadata.stores?.[browser], browser);
    if (href) {
      const link = document.createElement("a"); link.textContent = "★ Rate KoalaShot";
      link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
      rating.replaceWith(link);
    }
  } catch { /* Local metadata is optional; support links remain available. */ }
}
