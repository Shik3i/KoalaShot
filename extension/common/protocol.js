export const CAPTURE_PORT_PREFIX = "koalashot-capture:";

const MESSAGE_TYPES = new Set(["start", "scroll", "restore", "ping"]);

export function isValidSessionId(value) {
  return typeof value === "string" && /^[A-Za-z0-9-]{16,128}$/.test(value);
}

export function isValidCaptureMessage(message) {
  if (!message || typeof message !== "object" || !isValidSessionId(message.sessionId)) {
    return false;
  }

  if (!MESSAGE_TYPES.has(message.type)) {
    return false;
  }

  if (message.type !== "scroll") {
    return true;
  }

  return Number.isFinite(message.requestedY)
    && message.requestedY >= 0
    && message.requestedY <= 100_000_000
    && Number.isInteger(message.sectionIndex)
    && message.sectionIndex >= 0
    && Number.isInteger(message.sectionCount)
    && message.sectionCount > 0
    && message.sectionCount <= 100_000
    && typeof message.isFinal === "boolean";
}

export function isMatchingCapturePortName(name, sessionId) {
  return name === `${CAPTURE_PORT_PREFIX}${sessionId}`;
}
