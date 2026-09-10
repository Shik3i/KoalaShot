"""KoalaShot shipping policy shared by build, source and downloaded ZIP checks."""
import json
import re
from pathlib import PurePosixPath


def validate_manifest(manifest, browser, read):
    def require(condition, message):
        if not condition:
            raise ValueError(f"{browser} manifest: {message}")

    def asset(name):
        require(isinstance(name, str) and name and "\\" not in name and ":" not in name
                and not PurePosixPath(name).is_absolute() and ".." not in PurePosixPath(name).parts,
                f"unsafe asset path: {name}")
        try:
            return read(name)
        except (KeyError, OSError) as error:
            raise ValueError(f"{browser} manifest: missing packaged asset: {name}") from error

    require("key" not in manifest, "development-only manifest key must not ship")
    for field in ("update_url", "host_permissions", "optional_host_permissions", "content_scripts", "web_accessible_resources", "background", "externally_connectable"):
        require(field not in manifest, f"unexpected field for on-demand local capture: {field}")
    require(manifest.get("manifest_version") == 3, "Manifest V3 required")
    require(set(manifest.get("permissions", [])) == {"activeTab", "scripting", "storage"}, "unexpected required permissions")
    require(manifest.get("optional_permissions") == ["clipboardWrite"], "only clipboardWrite may be optional")
    require(manifest.get("incognito") == "not_allowed", "private capture is unsupported with persistent editor drafts")
    require(manifest.get("default_locale") == "en", "English must be the shipping default")
    messages = json.loads(asset("_locales/en/messages.json"))

    def localized(value):
        def replace(match):
            entry = messages.get(match[1], {}).get("message")
            require(isinstance(entry, str) and bool(entry.strip()), f"missing locale message: {match[1]}")
            return entry
        require(isinstance(value, str), "missing text field")
        return re.sub(r"__MSG_(\w+)__", replace, value)

    for field, limit in (("name", 75), ("short_name", 12), ("description", 132)):
        value = localized(manifest.get(field))
        require(bool(value.strip()) and len(value) <= limit, f"invalid {field} length (maximum {limit})")
    action = manifest.get("action", {})
    require(bool(localized(action.get("default_title")).strip()), "missing toolbar tooltip")
    asset(action.get("default_popup"))
    for size in ("16", "32", "48", "128"):
        require(asset(manifest.get("icons", {}).get(size)).startswith(b"\x89PNG\r\n\x1a\n"), f"invalid {size}px icon")
    require(manifest.get("content_security_policy") == {"extension_pages": "script-src 'self'; object-src 'none'"}, "unexpected executable content policy")
    if browser == "chrome":
        require("browser_specific_settings" not in manifest, "Firefox settings must not ship in Chrome")
    else:
        gecko = manifest.get("browser_specific_settings", {}).get("gecko", {})
        require(gecko.get("id") == "koalashot@koalastuff.net", "unexpected add-on ID")
        require(gecko.get("data_collection_permissions", {}).get("required") == ["none"], "data collection must be declared as none")


def validate_payload_names(names):
    for name in names:
        parts = PurePosixPath(name).parts
        if any(part.startswith(".") or part in {"node_modules", "tests", "manifests"} for part in parts) or re.search(r"\.(?:test|spec)\.[cm]?js$|\.(?:map|pem|key)$", name):
            raise ValueError(f"Development file must not ship: {name}")
