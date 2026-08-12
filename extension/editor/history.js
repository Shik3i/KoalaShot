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
