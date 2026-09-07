import { cloneAnnotations } from "./annotation-model.js";

function sameState(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

export class AnnotationHistory {
  constructor(initialState = [], { limit = 100, onChange = () => {} } = {}) {
    this.limit = limit;
    this.onChange = onChange;
    this.current = cloneAnnotations(initialState);
    this.past = [];
    this.future = [];
  }

  getState() {
    return cloneAnnotations(this.current);
  }

  setCurrent(nextState, { notify = true } = {}) {
    this.current = cloneAnnotations(nextState);
    if (notify) {
      this.onChange(this.getState());
    }
  }

  apply(label, nextState) {
    const next = cloneAnnotations(nextState);
    if (sameState(this.current, next)) {
      return false;
    }
    this.past.push({ label, before: this.getState(), after: next });
    if (this.past.length > this.limit) {
      this.past.shift();
    }
    this.current = next;
    this.future = [];
    this.onChange(this.getState());
    return true;
  }

  undo() {
    const action = this.past.pop();
    if (!action) {
      return false;
    }
    this.future.push(action);
    this.current = cloneAnnotations(action.before);
    this.onChange(this.getState());
    return true;
  }

  redo() {
    const action = this.future.pop();
    if (!action) {
      return false;
    }
    this.past.push(action);
    this.current = cloneAnnotations(action.after);
    this.onChange(this.getState());
    return true;
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }
}

// Frozen snapshots share unchanged annotations; rendering uses peekState().
const owned = new WeakSet();
const encoded = new WeakMap();
function freezeTree(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}
function snapshot(state, previous) {
  if (!Array.isArray(state?.annotations) || state.annotations.length > 5000) throw new Error("The editor supports at most 5000 annotations.");
  const prior = new Map(previous?.annotations.map(a => [a.id, a]) || []);
  const annotations = state.annotations.map(annotation => {
    if (owned.has(annotation)) return annotation;
    const json = JSON.stringify(annotation);
    const existing = prior.get(annotation.id);
    if (existing && encoded.get(existing) === json) return existing;
    const next = freezeTree(JSON.parse(json));
    owned.add(next); encoded.set(next, json);
    return next;
  });
  return Object.freeze({ annotations: Object.freeze(annotations), crop: state.crop ? Object.freeze({ ...state.crop }) : null });
}
function stateBytes(state) {
  return state.annotations.reduce((bytes, a) => bytes + encoded.get(a).length * 2, 0) + 128;
}
export class DocumentHistory {
  constructor(initialState = {}, { limit = 100, byteLimit = 16 * 1024 * 1024, onChange = () => {} } = {}) {
    this.limit = limit; this.byteLimit = byteLimit; this.onChange = onChange;
    this.current = snapshot({ annotations: [], crop: null, ...initialState });
    this.past = []; this.future = []; this.revision = 0;
  }
  peekState() { return this.current; }
  getState() { return { annotations: cloneAnnotations(this.current.annotations), crop: this.current.crop ? { ...this.current.crop } : null }; }
  changed(notify = true) { this.revision += 1; if (notify) this.onChange(this.current); }
  setCurrent(nextState, { notify = true } = {}) {
    this.current = snapshot(nextState, this.current); this.past = []; this.future = []; this.changed(notify);
  }
  apply(label, nextState) {
    const next = snapshot(nextState, this.current);
    if (next.annotations.length === this.current.annotations.length
      && next.annotations.every((a, i) => a === this.current.annotations[i])
      && JSON.stringify(next.crop) === JSON.stringify(this.current.crop)) return false;
    this.past.push({ label, before: this.current, after: next, bytes: stateBytes(this.current) });
    let bytes = this.past.reduce((sum, action) => sum + action.bytes, 0);
    while (this.past.length > this.limit || (bytes > this.byteLimit && this.past.length > 1)) bytes -= this.past.shift().bytes;
    this.current = next; this.future = []; this.changed(); return true;
  }
  undo() {
    const action = this.past.pop(); if (!action) return false;
    this.future.push(action); this.current = action.before; this.changed(); return true;
  }
  redo() {
    const action = this.future.pop(); if (!action) return false;
    this.past.push(action); this.current = action.after; this.changed(); return true;
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}
