export const FONT_FAMILY = "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function distanceSquared(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

export function normalizeRectangle(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.sqrt(distanceSquared(point, start));
  }
  const projection = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
}

export function reducePoints(points, minimumDistance = 1.25, maximumPoints = 2000) {
  if (!Array.isArray(points) || points.length <= 2) {
    return points ? points.map((point) => ({ x: point.x, y: point.y })) : [];
  }
  const reduced = [{ x: points[0].x, y: points[0].y }];
  const minimumSquared = minimumDistance ** 2;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    if (distanceSquared(point, reduced.at(-1)) >= minimumSquared) {
      reduced.push({ x: point.x, y: point.y });
    }
  }
  const last = points.at(-1);
  if (distanceSquared(last, reduced.at(-1)) > 0) {
    reduced.push({ x: last.x, y: last.y });
  }
  if (reduced.length <= maximumPoints) {
    return reduced;
  }
  const sampled = [];
  const stride = (reduced.length - 1) / (maximumPoints - 1);
  for (let index = 0; index < maximumPoints; index += 1) {
    const point = reduced[Math.round(index * stride)];
    sampled.push({ x: point.x, y: point.y });
  }
  return sampled;
}

export function arrowheadGeometry(start, end, strokeWidth) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const size = Math.min(Math.max(strokeWidth * 4, 10), Math.max(10, distance * 0.65));
  const spread = Math.PI / 7;
  return {
    tip: { x: end.x, y: end.y },
    left: { x: end.x - size * Math.cos(angle - spread), y: end.y - size * Math.sin(angle - spread) },
    right: { x: end.x - size * Math.cos(angle + spread), y: end.y - size * Math.sin(angle + spread) },
  };
}

export function textBounds(annotation) {
  const lines = annotation.text.split("\n");
  const widest = lines.reduce((width, line) => Math.max(width, line.length * annotation.fontSize * 0.62), 0);
  return {
    x: annotation.x,
    y: annotation.y,
    width: Math.max(annotation.fontSize, widest),
    height: Math.max(annotation.fontSize, lines.length * annotation.fontSize * 1.25),
  };
}

export function annotationBounds(annotation) {
  if (annotation.type === "pen" || annotation.type === "highlighter") {
    const xs = annotation.points.map((point) => point.x);
    const ys = annotation.points.map((point) => point.y);
    const padding = annotation.strokeWidth / 2;
    const x = Math.min(...xs) - padding;
    const y = Math.min(...ys) - padding;
    return { x, y, width: Math.max(...xs) - Math.min(...xs) + padding * 2, height: Math.max(...ys) - Math.min(...ys) + padding * 2 };
  }
  if (annotation.type === "line" || annotation.type === "arrow") {
    const padding = annotation.strokeWidth / 2 + (annotation.type === "arrow" ? annotation.strokeWidth * 2 : 0);
    const x = Math.min(annotation.startX, annotation.endX) - padding;
    const y = Math.min(annotation.startY, annotation.endY) - padding;
    return { x, y, width: Math.abs(annotation.endX - annotation.startX) + padding * 2, height: Math.abs(annotation.endY - annotation.startY) + padding * 2 };
  }
  if (annotation.type === "text") {
    return textBounds(annotation);
  }
  if (annotation.type === "marker") {
    return { x: annotation.x - annotation.radius, y: annotation.y - annotation.radius, width: annotation.radius * 2, height: annotation.radius * 2 };
  }
  const padding = ["rectangle", "ellipse"].includes(annotation.type) ? annotation.strokeWidth / 2 : 0;
  return { x: annotation.x - padding, y: annotation.y - padding, width: annotation.width + padding * 2, height: annotation.height + padding * 2 };
}

function pointInBounds(point, bounds, padding = 0) {
  return point.x >= bounds.x - padding && point.x <= bounds.x + bounds.width + padding
    && point.y >= bounds.y - padding && point.y <= bounds.y + bounds.height + padding;
}

export function hitTestAnnotation(annotation, point, tolerance = 8) {
  if (annotation.type === "pen" || annotation.type === "highlighter") {
    for (let index = 1; index < annotation.points.length; index += 1) {
      if (distanceToSegment(point, annotation.points[index - 1], annotation.points[index]) <= tolerance + annotation.strokeWidth / 2) {
        return true;
      }
    }
    return false;
  }
  if (annotation.type === "line" || annotation.type === "arrow") {
    return distanceToSegment(point, { x: annotation.startX, y: annotation.startY }, { x: annotation.endX, y: annotation.endY }) <= tolerance + annotation.strokeWidth / 2;
  }
  if (annotation.type === "marker") {
    return distanceSquared(point, { x: annotation.x, y: annotation.y }) <= (annotation.radius + tolerance) ** 2;
  }
  return pointInBounds(point, annotationBounds(annotation), tolerance);
}

export function imagePointFromClient({ clientX, clientY, viewportRect, scrollLeft, scrollTop, zoom }) {
  return {
    x: (clientX - viewportRect.left + scrollLeft) / zoom,
    y: (clientY - viewportRect.top + scrollTop) / zoom,
  };
}

export function clientPointFromImage({ x, y, viewportRect, scrollLeft, scrollTop, zoom }) {
  return {
    x: viewportRect.left + x * zoom - scrollLeft,
    y: viewportRect.top + y * zoom - scrollTop,
  };
}

export function boundsIntersectViewport(bounds, viewport, padding = 0) {
  return bounds.x + bounds.width >= viewport.x - padding
    && bounds.x <= viewport.x + viewport.width + padding
    && bounds.y + bounds.height >= viewport.y - padding
    && bounds.y <= viewport.y + viewport.height + padding;
}

function beginStroke(context, annotation) {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = annotation.strokeWidth;
  context.strokeStyle = annotation.color;
  if (annotation.type === "highlighter") {
    context.globalAlpha = annotation.opacity;
  }
  context.beginPath();
}

function drawPolyline(context, points) {
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.stroke();
}

export function drawAnnotation(context, annotation) {
  if (annotation.type === "pen" || annotation.type === "highlighter") {
    beginStroke(context, annotation);
    drawPolyline(context, annotation.points);
    context.restore();
    return;
  }
  if (annotation.type === "line" || annotation.type === "arrow") {
    beginStroke(context, annotation);
    context.moveTo(annotation.startX, annotation.startY);
    context.lineTo(annotation.endX, annotation.endY);
    context.stroke();
    if (annotation.type === "arrow") {
      const head = arrowheadGeometry({ x: annotation.startX, y: annotation.startY }, { x: annotation.endX, y: annotation.endY }, annotation.strokeWidth);
      context.beginPath();
      context.moveTo(head.tip.x, head.tip.y);
      context.lineTo(head.left.x, head.left.y);
      context.lineTo(head.right.x, head.right.y);
      context.closePath();
      context.fillStyle = annotation.color;
      context.fill();
    }
    context.restore();
    return;
  }
  if (annotation.type === "ellipse") {
    context.save();
    context.strokeStyle = annotation.color;
    context.lineWidth = annotation.strokeWidth;
    context.beginPath();
    context.ellipse(annotation.x + annotation.width / 2, annotation.y + annotation.height / 2, annotation.width / 2, annotation.height / 2, 0, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    return;
  }
  if (annotation.type === "rectangle") {
    context.save();
    context.strokeStyle = annotation.color;
    context.lineWidth = annotation.strokeWidth;
    context.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);
    context.restore();
    return;
  }
  if (annotation.type === "redact") {
    context.save();
    context.globalAlpha = 1;
    context.fillStyle = annotation.color;
    context.fillRect(annotation.x, annotation.y, annotation.width, annotation.height);
    context.restore();
    return;
  }
  if (annotation.type === "pixelate" || annotation.type === "blur") {
    context.save();
    context.fillStyle = annotation.type === "pixelate" ? "rgb(40 122 74 / 18%)" : "rgb(21 101 192 / 18%)";
    context.strokeStyle = annotation.color;
    context.lineWidth = Math.max(2, annotation.strokeWidth || 2);
    context.setLineDash?.([8, 5]);
    context.fillRect(annotation.x, annotation.y, annotation.width, annotation.height);
    context.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);
    context.restore();
    return;
  }
  if (annotation.type === "marker") {
    context.save();
    context.fillStyle = annotation.color;
    context.beginPath();
    context.arc(annotation.x, annotation.y, annotation.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = `700 ${Math.max(12, annotation.radius)}px ${FONT_FAMILY}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(annotation.number), annotation.x, annotation.y);
    context.restore();
    return;
  }
  if (annotation.type === "text") {
    context.save();
    context.fillStyle = annotation.color;
    context.font = `${annotation.fontSize}px ${FONT_FAMILY}`;
    context.textBaseline = "top";
    const lineHeight = annotation.fontSize * 1.25;
    annotation.text.split("\n").forEach((line, index) => context.fillText(line, annotation.x, annotation.y + index * lineHeight));
    context.restore();
  }
}

export function drawAnnotations(context, annotations, selectedId = "") {
  annotations.forEach((annotation) => drawAnnotation(context, annotation));
  if (selectedId) {
    const selected = annotations.find((annotation) => annotation.id === selectedId);
    if (selected) {
      const bounds = annotationBounds(selected);
      context.save();
      context.strokeStyle = "#287a4a";
      context.lineWidth = 2;
      context.setLineDash?.([6, 4]);
      context.strokeRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);
      context.restore();
    }
  }
}
