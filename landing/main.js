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
      if (typeof metadata.version === "string" && metadata.version) {
        versionTarget.textContent = `v${metadata.version}`;
      }
    })
    .catch(() => {
      versionTarget.textContent = "development build";
    });
}
