import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
const stableSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

if (!stableSemver.test(version || "")) {
  throw new Error("Usage: npm run release:prepare -- <MAJOR.MINOR.PATCH>");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const chromeManifest = readJson("extension/manifests/chrome.json");
const firefoxManifest = readJson("extension/manifests/firefox.json");
const landingVersion = readJson("landing/version.json");

if (packageJson.version === version) {
  throw new Error(`package.json is already at v${version}; choose a new release version`);
}

packageJson.version = version;
packageLock.version = version;
packageLock.packages[""].version = version;
chromeManifest.version = version;
firefoxManifest.version = version;
landingVersion.version = version;
landingVersion.date = new Date().toISOString();

const constantsPath = path.join(root, "extension/common/constants.js");
const constants = fs.readFileSync(constantsPath, "utf8");
const updatedConstants = constants.replace(/export const VERSION = ["'].*?["']/, `export const VERSION = "${version}"`);
if (updatedConstants === constants) {
  throw new Error("extension/common/constants.js does not contain an exportable VERSION constant");
}

const readmePath = path.join(root, "README.md");
const readme = fs.readFileSync(readmePath, "utf8");
const updatedReadme = readme
  .replace(/Release-v\d+\.\d+\.\d+-blue/g, `Release-v${version}-blue`)
  .replace(/Current release: v\d+\.\d+\.\d+/g, `Current release: v${version}`)
  .replace(/koalashot-(chrome|firefox)-\d+\.\d+\.\d+\.zip/g, `koalashot-$1-${version}.zip`);
if (updatedReadme === readme) {
  throw new Error("README.md does not contain the release metadata expected by the release process");
}

writeJson("package.json", packageJson);
writeJson("package-lock.json", packageLock);
writeJson("extension/manifests/chrome.json", chromeManifest);
writeJson("extension/manifests/firefox.json", firefoxManifest);
writeJson("landing/version.json", landingVersion);
fs.writeFileSync(constantsPath, updatedConstants, "utf8");
fs.writeFileSync(readmePath, updatedReadme, "utf8");

console.log(`Prepared KoalaShot v${version}.`);
console.log("Review the diff, run npm test, commit main, then push the annotated tag.");
