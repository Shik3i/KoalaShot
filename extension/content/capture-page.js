(() => {
  if (globalThis.__koalaShotCaptureContentLoaded) {
    return;
  }
  globalThis.__koalaShotCaptureContentLoaded = true;

  const api = globalThis.browser || globalThis.chrome;
  const CAPTURE_PORT_PREFIX = "koalashot-capture:";
  const WATCHDOG_TIMEOUT_MS = 15_000;
  const PAINT_SETTLE_MS = 120;
  let activeSession = null;

  function send(port, message) {
    try {
      port.postMessage(message);
    } catch {
      // A disconnected popup is handled by onDisconnect and the watchdog.
    }
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function nextAnimationFrame() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 16);
      }
    });
  }

  async function waitForPaint() {
    await nextAnimationFrame();
    await nextAnimationFrame();
    await wait(PAINT_SETTLE_MS);
  }

  function isValidSessionId(value) {
    return typeof value === "string" && /^[A-Za-z0-9-]{16,128}$/.test(value);
  }

  function isValidMessage(message) {
    if (!message || typeof message !== "object" || !isValidSessionId(message.sessionId)) {
      return false;
    }
    if (!["start", "scroll", "restore", "ping"].includes(message.type)) {
      return false;
    }
    if (message.type === "start") {
      return message.target === undefined || message.target === "page" || message.target === "internal";
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

  function measurePage() {
    const root = document.documentElement;
    const body = document.body;
    const heights = [
      root?.scrollHeight || 0,
      root?.offsetHeight || 0,
      root?.clientHeight || 0,
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      body?.clientHeight || 0,
      window.innerHeight || 0,
    ];
    const widths = [
      root?.scrollWidth || 0,
      root?.offsetWidth || 0,
      body?.scrollWidth || 0,
      body?.offsetWidth || 0,
      window.innerWidth || 0,
    ];
    return {
      documentHeight: Math.max(...heights),
      documentWidth: Math.max(...widths),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
  }

  function findInternalScrollArea(measurement) {
    const elements = document.querySelectorAll("body *");
    let best = null;
    let bestScore = 0;
    for (const element of elements) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }
      if (element.scrollHeight - element.clientHeight < 100) {
        continue;
      }
      const style = getComputedStyle(element);
      const scrollable = /(auto|scroll|overlay)/.test(style.overflowY);
      const sizeable = element.clientWidth >= measurement.viewportWidth * 0.5
        && element.clientHeight >= measurement.viewportHeight * 0.35;
      if (scrollable && sizeable) {
        const score = element.clientWidth * element.scrollHeight;
        if (score > bestScore) {
          best = element;
          bestScore = score;
        }
      }
    }
    return best;
  }

  function measureSession(session) {
    const screenViewportWidth = window.innerWidth;
    const screenViewportHeight = window.innerHeight;
    if (session.captureTarget === "internal") {
      const target = session.targetElement;
      const rect = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
      const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
      const captureRect = {
        left: rect.left + borderLeft,
        top: rect.top + borderTop,
        width: target.clientWidth,
        height: target.clientHeight,
      };
      if (captureRect.left < 0 || captureRect.top < 0
        || captureRect.left + captureRect.width > screenViewportWidth + 1
        || captureRect.top + captureRect.height > screenViewportHeight + 1
        || captureRect.width <= 0 || captureRect.height <= 0) {
        throw new Error("The internal scroll area must be fully visible in the browser viewport.");
      }
      return {
        documentHeight: target.scrollHeight,
        documentWidth: target.scrollWidth,
        viewportWidth: target.clientWidth,
        viewportHeight: target.clientHeight,
        screenViewportWidth,
        screenViewportHeight,
        captureRect,
        scrollX: target.scrollLeft,
        scrollY: target.scrollTop,
      };
    }
    const page = measurePage();
    return {
      ...page,
      screenViewportWidth,
      screenViewportHeight,
      captureRect: { left: 0, top: 0, width: screenViewportWidth, height: screenViewportHeight },
    };
  }

  function recordStyle(element, property) {
    return {
      element,
      property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    };
  }

  function restoreStyle(record) {
    if (record.value) {
      record.element.style.setProperty(record.property, record.value, record.priority);
    } else {
      record.element.style.removeProperty(record.property);
    }
  }

  function classifyPositionedElement(element) {
    const style = getComputedStyle(element);
    if (style.position !== "fixed" && style.position !== "sticky") {
      return null;
    }
    const rect = element.getBoundingClientRect();
    const atTop = rect.top <= 8 || style.top !== "auto";
    const atBottom = rect.bottom >= window.innerHeight - 8 || style.bottom !== "auto";
    if (style.position === "sticky") {
      return atTop ? "sticky-top" : atBottom ? "sticky-bottom" : null;
    }
    return atTop ? "fixed-top" : atBottom ? "fixed-bottom" : "fixed-floating";
  }

  function collectPositionedElements() {
    const elements = [];
    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }
      const kind = classifyPositionedElement(element);
      if (kind) {
        elements.push({
          element,
          kind,
          visibility: recordStyle(element, "visibility"),
        });
      }
    }
    return elements;
  }

  function setVisibility(item, visible) {
    if (visible) {
      restoreStyle(item.visibility);
      return;
    }
    item.element.style.setProperty("visibility", "hidden", "important");
  }

  function applySectionVisibility(session, sectionIndex, isFinal) {
    for (const item of session.positionedElements) {
      const hidden = item.kind === "fixed-top" || item.kind === "sticky-top"
        ? sectionIndex > 0
        : item.kind === "fixed-bottom" || item.kind === "sticky-bottom"
          ? !isFinal
          : sectionIndex > 0;
      setVisibility(item, !hidden);
    }
  }

  function createCaptureStyles() {
    const style = document.createElement("style");
    style.id = "koalashot-capture-styles";
    style.textContent = [
      "html.koalashot-capturing { scrollbar-width: none !important; }",
      "html.koalashot-capturing::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }",
      "html.koalashot-capturing [data-koalashot-capture-target] { scrollbar-width: none !important; }",
      "html.koalashot-capturing [data-koalashot-capture-target]::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }",
      "html.koalashot-capturing, html.koalashot-capturing * { scroll-behavior: auto !important; }",
      "html.koalashot-capturing *, html.koalashot-capturing *::before, html.koalashot-capturing *::after { animation-play-state: paused !important; transition: none !important; caret-color: transparent !important; }",
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
    return style;
  }

  function restorePage(session) {
    if (!session || session.cleaned) {
      return;
    }
    session.cleaned = true;
    for (const item of session.positionedElements || []) {
      restoreStyle(item.visibility);
    }
    if (session.targetElement) {
      if (session.targetAttributeValue === null) {
        session.targetElement.removeAttribute("data-koalashot-capture-target");
      } else {
        session.targetElement.setAttribute("data-koalashot-capture-target", session.targetAttributeValue);
      }
      restoreStyle(session.targetScrollBehavior);
      restoreStyle(session.targetScrollbarWidth);
      try {
        session.targetElement.scrollTo({ left: session.scrollX, top: session.scrollY, behavior: "auto" });
      } catch {
        session.targetElement.scrollLeft = session.scrollX;
        session.targetElement.scrollTop = session.scrollY;
      }
    } else {
      try {
        window.scrollTo(session.scrollX, session.scrollY);
      } catch {
        // Navigation may have made restoring the old position impossible.
      }
    }
    if (session.styleElement?.isConnected) {
      session.styleElement.remove();
    }
    if (document.documentElement) {
      if (!session.captureClassWasPresent) {
        document.documentElement.classList.remove("koalashot-capturing");
      }
      restoreStyle(session.rootScrollBehavior);
    }
    if (document.body) {
      restoreStyle(session.bodyScrollBehavior);
      restoreStyle(session.bodyPaddingRight);
    }
  }

  function clearActiveSession(session) {
    if (activeSession === session) {
      activeSession = null;
    }
  }

  function isCurrentSession(session, port, sessionId) {
    return activeSession === session
      && session.port === port
      && session.sessionId === sessionId
      && !session.cleaned;
  }

  async function startSession(port, message) {
    if (activeSession) {
      restorePage(activeSession);
      clearActiveSession(activeSession);
    }
    const before = measurePage();
    const captureTarget = message.target === "internal" ? "internal" : "page";
    const internalScrollArea = findInternalScrollArea(before);
    if (captureTarget === "page" && internalScrollArea && before.documentHeight <= before.viewportHeight + 2) {
      send(port, { ok: false, sessionId: message.sessionId, error: "internal-scroll", message: "This page has a scrollable area inside the page. Select “Scrollable area inside the page” to capture it." });
      return;
    }
    if (captureTarget === "internal" && !internalScrollArea) {
      send(port, { ok: false, sessionId: message.sessionId, error: "internal-scroll", message: "No scrollable internal area was found on this page." });
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    const session = {
      sessionId: message.sessionId,
      port,
      captureTarget,
      targetElement: internalScrollArea,
      scrollX: captureTarget === "internal" ? internalScrollArea.scrollLeft : before.scrollX,
      scrollY: captureTarget === "internal" ? internalScrollArea.scrollTop : before.scrollY,
      captureClassWasPresent: root?.classList.contains("koalashot-capturing") || false,
      rootScrollBehavior: root ? recordStyle(root, "scroll-behavior") : null,
      bodyScrollBehavior: body ? recordStyle(body, "scroll-behavior") : null,
      bodyPaddingRight: body ? recordStyle(body, "padding-right") : null,
      targetScrollBehavior: internalScrollArea ? recordStyle(internalScrollArea, "scroll-behavior") : null,
      targetScrollbarWidth: internalScrollArea ? recordStyle(internalScrollArea, "scrollbar-width") : null,
      targetAttributeValue: internalScrollArea?.getAttribute("data-koalashot-capture-target") ?? null,
      positionedElements: [],
      styleElement: null,
      cleaned: false,
      lastMessageAt: Date.now(),
    };
    activeSession = session;

    try {
      if (root) {
        root.classList.add("koalashot-capturing");
        root.style.setProperty("scroll-behavior", "auto", "important");
      }
      if (internalScrollArea) {
        internalScrollArea.setAttribute("data-koalashot-capture-target", "true");
        internalScrollArea.style.setProperty("scroll-behavior", "auto", "important");
        internalScrollArea.style.setProperty("scrollbar-width", "none", "important");
      }
      if (body) {
        body.style.setProperty("scroll-behavior", "auto", "important");
        if (captureTarget === "page") {
          const gutter = Math.max(0, window.innerWidth - root.clientWidth);
          if (gutter > 0) {
            const currentPadding = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
            body.style.setProperty("padding-right", `${currentPadding + gutter}px`, "important");
          }
        }
      }
      session.styleElement = createCaptureStyles();
      session.positionedElements = collectPositionedElements();
      const after = measureSession(session);
      send(port, {
        ok: true,
        sessionId: message.sessionId,
        type: "ready",
        pageUrl: location.href,
        pageTitle: document.title,
        documentHeight: after.documentHeight,
        documentWidth: after.documentWidth,
        viewportWidth: after.viewportWidth,
        viewportHeight: after.viewportHeight,
        scrollX: after.scrollX,
        scrollY: after.scrollY,
        screenViewportWidth: after.screenViewportWidth,
        screenViewportHeight: after.screenViewportHeight,
        captureRect: after.captureRect,
        captureTarget,
      });
    } catch (error) {
      restorePage(session);
      clearActiveSession(session);
      send(port, { ok: false, sessionId: message.sessionId, error: "start-failed", message: error instanceof Error ? error.message : "Capture setup failed." });
    }
  }

  async function scrollSession(port, message) {
    const session = activeSession;
    if (!session || !isCurrentSession(session, port, message.sessionId)) {
      send(port, { ok: false, sessionId: message.sessionId, error: "stale-session", message: "The capture session is no longer active." });
      return;
    }
    session.lastMessageAt = Date.now();
    try {
      if (session.targetElement) {
        session.targetElement.scrollTo({ left: 0, top: message.requestedY, behavior: "auto" });
      } else {
        window.scrollTo({ left: 0, top: message.requestedY, behavior: "auto" });
      }
      await waitForPaint();
      if (!isCurrentSession(session, port, message.sessionId)) {
        send(port, { ok: false, sessionId: message.sessionId, error: "stale-session", message: "The capture session is no longer active." });
        return;
      }
      applySectionVisibility(session, message.sectionIndex, message.isFinal);
      await waitForPaint();
      if (!isCurrentSession(session, port, message.sessionId)) {
        send(port, { ok: false, sessionId: message.sessionId, error: "stale-session", message: "The capture session is no longer active." });
        return;
      }
      const after = measureSession(session);
      send(port, {
        ok: true,
        sessionId: message.sessionId,
        type: "scrolled",
        actualX: after.scrollX,
        actualY: after.scrollY,
        maxScrollY: Math.max(0, after.documentHeight - after.viewportHeight),
        documentHeight: after.documentHeight,
        viewportWidth: after.viewportWidth,
        viewportHeight: after.viewportHeight,
        screenViewportWidth: after.screenViewportWidth,
        screenViewportHeight: after.screenViewportHeight,
        captureRect: after.captureRect,
        pageUrl: location.href,
      });
    } catch (error) {
      send(port, { ok: false, sessionId: message.sessionId, error: "scroll-failed", message: error instanceof Error ? error.message : "Could not scroll the page." });
    }
  }

  function restoreSession(port, message) {
    const session = activeSession;
    if (!session || session.port !== port || session.sessionId !== message.sessionId) {
      send(port, { ok: true, sessionId: message.sessionId, type: "restored" });
      return;
    }
    session.lastMessageAt = Date.now();
    restorePage(session);
    clearActiveSession(session);
    send(port, { ok: true, sessionId: message.sessionId, type: "restored" });
  }

  function handleDisconnect(port) {
    if (activeSession?.port === port) {
      restorePage(activeSession);
      clearActiveSession(activeSession);
    }
  }

  function handlePort(port) {
    if (typeof port.name !== "string" || !port.name.startsWith(CAPTURE_PORT_PREFIX)) {
      return;
    }
    port.onMessage.addListener((message) => {
      if (!isValidMessage(message) || message.sessionId !== port.name.slice(CAPTURE_PORT_PREFIX.length)) {
        send(port, { ok: false, error: "invalid-message", message: "Invalid capture message." });
        return;
      }
      if (message.type === "start") {
        void startSession(port, message);
      } else if (message.type === "scroll") {
        void scrollSession(port, message);
      } else if (message.type === "restore") {
        restoreSession(port, message);
      } else if (message.type === "ping") {
        if (activeSession?.sessionId === message.sessionId) {
          activeSession.lastMessageAt = Date.now();
        }
        send(port, { ok: true, sessionId: message.sessionId, type: "pong" });
      }
    });
    port.onDisconnect.addListener(() => handleDisconnect(port));
  }

  api.runtime.onConnect.addListener(handlePort);
  setInterval(() => {
    if (activeSession && Date.now() - activeSession.lastMessageAt > WATCHDOG_TIMEOUT_MS) {
      restorePage(activeSession);
      clearActiveSession(activeSession);
    }
  }, 2_000);
})();
