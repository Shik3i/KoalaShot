const year = document.querySelector("[data-current-year]");
if (year) {
  year.textContent = String(new Date().getFullYear());
}

const versionTarget = document.querySelector("[data-app-version]");
if (versionTarget) {
  const versionUrl = versionTarget.dataset.versionUrl || "version.json";
  fetch(versionUrl, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`version request failed: ${response.status}`);
      }
      return response.json();
    })
    .then((metadata) => {
      for (const link of document.querySelectorAll("[data-store]")) {
        const raw = metadata.stores?.[link.dataset.store];
        if (!raw) continue;
        try {
          const url = new URL(raw);
          const valid = url.protocol === "https:" && (link.dataset.store === "chrome"
            ? url.hostname === "chromewebstore.google.com" && url.pathname.startsWith("/detail/")
            : url.hostname === "addons.mozilla.org" && /\/firefox\/addon\//.test(url.pathname));
          if (valid) { link.href = url.href; link.hidden = false; }
        } catch { /* Keep unpublished store links hidden. */ }
      }
      if ([...document.querySelectorAll("[data-store]")].some(link => !link.hidden)) {
        const pending = document.querySelector("[data-store-pending]");
        if (pending) pending.hidden = true;
      }
      if (typeof metadata.version === "string" && metadata.version) {
        versionTarget.textContent = `v${metadata.version}`;
        versionTarget.hidden = false;
      }
    })
    .catch(() => {
      versionTarget.hidden = true;
    });
}
