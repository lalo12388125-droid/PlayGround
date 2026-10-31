export class Input {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, down: false, active: false };
    this.isTouch =
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
      navigator.maxTouchPoints > 0;

    if (this.isTouch) document.body.classList.add("touch");

    this.sticks = {
      move: { active: false, id: null, vec: { x: 0, y: 0 }, el: null, knob: null },
      aim: { active: false, id: null, vec: { x: 0, y: 0 }, el: null, knob: null },
    };

    this._bindKeyboard();
    this._bindMouse();
    this._bindStick("move", "stickMove");
    this._bindStick("aim", "stickAim");

    window.addEventListener("blur", () => this.keys.clear());
  }

  _gesture() {
    this.handlers.onGesture?.();
  }

  _bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();
      if (
        key === " " ||
        key === "arrowup" ||
        key === "arrowdown" ||
        key === "arrowleft" ||
        key === "arrowright"
      ) {
        e.preventDefault();
      }
      this._gesture();
      if (!e.repeat) {
        if (key === "p" || key === "escape") this.handlers.onPause?.();
        if (key === "m") this.handlers.onMute?.();
        if (key === "enter") this.handlers.onEnter?.();
      }
      this.keys.add(key);
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
  }

  _bindMouse() {
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.active = true;
    });

    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") {
        document.body.classList.add("touch");
        this.isTouch = true;
        return;
      }
      this._gesture();
      if (e.button === 0) {
        this.pointer.down = true;
        this.pointer.x = e.clientX;
        this.pointer.y = e.clientY;
        this.pointer.active = true;
      }
    });

    window.addEventListener("pointerup", (e) => {
      if (e.pointerType === "touch") return;
      if (e.button === 0) this.pointer.down = false;
    });

    window.addEventListener("pointercancel", () => {
      this.pointer.down = false;
    });

    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  _bindStick(kind, id) {
    const el = document.getElementById(id);
    if (!el) return;
    const knob = el.querySelector(".stick-knob");
    const state = this.sticks[kind];
    state.el = el;
    state.knob = knob;

    const apply = (e) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const max = rect.width * 0.33;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      state.vec.x = dx / max;
      state.vec.y = dy / max;
      const dead = 0.12;
      if (Math.abs(state.vec.x) < dead) state.vec.x = 0;
      if (Math.abs(state.vec.y) < dead) state.vec.y = 0;
      knob.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    };

    const down = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (state.id !== null) return;
      document.body.classList.add("touch");
      this.isTouch = true;
      this._gesture();
      state.active = true;
      state.id = e.pointerId;
      el.classList.add("active");
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
      apply(e);
      e.preventDefault();
    };

    const move = (e) => {
      if (!state.active || e.pointerId !== state.id) return;
      apply(e);
      e.preventDefault();
    };

    const up = (e) => {
      if (e.pointerId !== state.id) return;
      state.active = false;
      state.id = null;
      state.vec.x = 0;
      state.vec.y = 0;
      el.classList.remove("active");
      knob.style.transform = "translate3d(0, 0, 0)";
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
  }

  getMove(out) {
    let x = 0;
    let y = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    if (this.sticks.move.active) {
      x += this.sticks.move.vec.x;
      y += this.sticks.move.vec.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    out.x = x;
    out.y = y;
    return out;
  }

  /** Returns normalized screen-space aim vector from the right stick, or null. */
  getStickAim(out) {
    const s = this.sticks.aim;
    if (!s.active) return null;
    const len = Math.hypot(s.vec.x, s.vec.y);
    if (len < 0.2) return null;
    out.x = s.vec.x;
    out.y = s.vec.y;
    return out;
  }

  stickFiring() {
    const s = this.sticks.aim;
    if (!s.active) return false;
    return Math.hypot(s.vec.x, s.vec.y) > 0.32;
  }

  firing() {
    return this.keys.has(" ") || this.pointer.down || this.stickFiring();
  }

  keyboardMoveActive() {
    return (
      this.keys.has("w") ||
      this.keys.has("a") ||
      this.keys.has("s") ||
      this.keys.has("d") ||
      this.keys.has("arrowup") ||
      this.keys.has("arrowdown") ||
      this.keys.has("arrowleft") ||
      this.keys.has("arrowright")
    );
  }
}
