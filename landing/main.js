const year = document.querySelector("[data-current-year]");
if (year) year.textContent = String(new Date().getFullYear());

const versionTarget = document.querySelector("[data-app-version]");
if (versionTarget) {
  fetch(versionTarget.dataset.versionUrl || "version.json", { cache: "no-store" })
    .then(response => { if (!response.ok) throw new Error("Metadata unavailable"); return response.json(); })
    .then(metadata => {
      for (const browser of ["chrome", "firefox"]) {
        const raw = metadata.stores?.[browser];
        let valid = false;
        let url;
        try {
          url = new URL(raw);
          valid = url.protocol === "https:" && !url.username && !url.password && !url.port && (browser === "chrome"
            ? url.hostname === "chromewebstore.google.com" && /^\/detail\/[^/]+\/[a-p]{32}\/?$/.test(url.pathname)
            : url.hostname === "addons.mozilla.org" && /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?firefox\/addon\/[^/]+\/?$/.test(url.pathname));
        } catch { /* Missing listing. Keep the packaged availability state. */ }
        if (!valid) continue;
        url.search = ""; url.hash = "";
        for (const link of document.querySelectorAll(`[data-store="${browser}"]`)) {
          link.href = link.hasAttribute("data-review") ? `${url.href.replace(/\/$/, "")}/reviews${browser === "firefox" ? "/" : ""}` : url.href;
          link.hidden = false;
        }
        const status = document.querySelector(`[data-store-status="${browser}"]`);
        if (status) {
          const link = document.createElement("a"); link.href = url.href;
          link.textContent = browser === "chrome" ? "Get KoalaShot on Chrome Web Store" : "Get KoalaShot on Firefox Add-ons";
          link.title = link.textContent;
          status.replaceChildren(link);
        }
      }
      if ([...document.querySelectorAll("[data-review]")].some(link => !link.hidden)) {
        document.querySelector("[data-review-pending]")?.setAttribute("hidden", "");
      }
      if (typeof metadata.version === "string" && metadata.version) {
        versionTarget.textContent = `v${metadata.version}`; versionTarget.hidden = false;
      }
    })
    .catch(() => { /* Build-time links and version remain usable offline. */ });
}
