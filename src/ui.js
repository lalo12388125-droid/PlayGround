const BEST_KEY = "pacstrike.best";

function pad(n, width = 6) {
  return String(Math.max(0, Math.floor(n))).padStart(width, "0");
}

export class UI {
  constructor() {
    this.el = {
      hud: document.getElementById("hud"),
      score: document.getElementById("score"),
      level: document.getElementById("level"),
      dots: document.getElementById("dots"),
      hearts: document.getElementById("hearts"),
      frenzyWrap: document.getElementById("frenzyWrap"),
      frenzyFill: document.getElementById("frenzyFill"),
      menuScreen: document.getElementById("menuScreen"),
      pauseScreen: document.getElementById("pauseScreen"),
      clearScreen: document.getElementById("clearScreen"),
      overScreen: document.getElementById("overScreen"),
      toast: document.getElementById("toast"),
      damage: document.getElementById("damage"),
      crosshair: document.getElementById("crosshair"),
      menuBest: document.getElementById("menuBest"),
      finalScore: document.getElementById("finalScore"),
      finalBest: document.getElementById("finalBest"),
      finalLevel: document.getElementById("finalLevel"),
      finalKills: document.getElementById("finalKills"),
      clearBonus: document.getElementById("clearBonus"),
      clearNext: document.getElementById("clearNext"),
      muteBtn: document.getElementById("muteBtn"),
      pauseBtn: document.getElementById("pauseBtn"),
    };

    this.best = 0;
    try {
      this.best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    } catch {}
    this.el.menuBest.textContent = pad(this.best);

    this.lastScore = -1;
    this.lastLevel = -1;
    this.lastDots = -1;
    this.lastHp = -1;
    this.lastMaxHp = -1;
    this.lastFrenzy = -1;
    this.heartEls = [];
    this.toastTimer = null;
    this.damageTimer = null;
    this.currentScreen = "menu";
  }

  bind(handlers) {
    const click = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("click", (e) => {
        e.preventDefault();
        handlers.onGesture?.();
        fn();
      });
    };
    click("startBtn", () => handlers.onStart?.());
    click("resumeBtn", () => handlers.onResume?.());
    click("restartBtn", () => handlers.onRestart?.());
    click("restartBtnPause", () => handlers.onRestart?.());
    click("menuBtn", () => handlers.onMenu?.());
    click("quitBtn", () => handlers.onMenu?.());
    this.el.pauseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handlers.onGesture?.();
      handlers.onPause?.();
    });
    this.el.muteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handlers.onGesture?.();
      handlers.onMute?.();
    });
  }

  setMuted(muted) {
    this.el.muteBtn.classList.toggle("muted", muted);
    this.el.muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  }

  setBest(best) {
    this.best = Math.max(this.best, Math.floor(best));
    this.el.menuBest.textContent = pad(this.best);
    try {
      localStorage.setItem(BEST_KEY, String(this.best));
    } catch {}
  }

  update(state) {
    const { score, level, pellets, hp, maxHp, frenzy, frenzyMax } = state;
    if (score !== this.lastScore) {
      this.el.score.textContent = pad(score);
      this.lastScore = score;
    }
    if (level !== this.lastLevel) {
      this.el.level.textContent = `LV ${pad(level, 2)}`;
      this.lastLevel = level;
    }
    if (pellets !== this.lastDots) {
      this.el.dots.textContent = `DOTS ${pad(pellets, 3)}`;
      this.lastDots = pellets;
    }
    if (hp !== this.lastHp || maxHp !== this.lastMaxHp) {
      this._renderHearts(hp, maxHp);
      this.lastHp = hp;
      this.lastMaxHp = maxHp;
    }
    const f = frenzyMax > 0 ? Math.max(0, frenzy) / frenzyMax : 0;
    if (Math.abs(f - this.lastFrenzy) > 0.005 || (frenzy <= 0 && this.lastFrenzy > 0)) {
      this.el.frenzyFill.style.transform = `scaleX(${f.toFixed(4)})`;
      this.el.frenzyWrap.classList.toggle("active", frenzy > 0);
      this.lastFrenzy = f;
    }
  }

  _renderHearts(hp, maxHp) {
    this.el.hearts.innerHTML = "";
    this.heartEls = [];
    for (let i = 0; i < maxHp; i++) {
      const span = document.createElement("span");
      span.textContent = "\u2665";
      span.className = i < hp ? "" : "empty";
      this.el.hearts.appendChild(span);
      this.heartEls.push(span);
    }
    this.el.hearts.setAttribute("aria-label", `${hp} of ${maxHp} lives`);
  }

  popHeart() {
    const full = this.heartEls.find((h) => !h.classList.contains("empty"));
    if (!full) return;
    full.classList.remove("pop");
    void full.offsetWidth;
    full.classList.add("pop");
  }

  showScreen(name) {
    this.currentScreen = name;
    this.el.menuScreen.classList.toggle("hidden", name !== "menu");
    this.el.pauseScreen.classList.toggle("hidden", name !== "pause");
    this.el.clearScreen.classList.toggle("hidden", name !== "clear");
    this.el.overScreen.classList.toggle("hidden", name !== "over");
    this.el.hud.classList.toggle("hidden", name === "menu");
    document.body.classList.toggle("in-menu", name === "menu");
    document.body.classList.toggle("ui-open", name !== "menu" && name !== "none");
  }

  showClear(level, bonus) {
    this.el.clearBonus.textContent = `+${bonus}`;
    this.el.clearNext.textContent = `LV ${pad(level + 1, 2)}`;
    this.showScreen("clear");
  }

  showOver(stats) {
    this.el.finalScore.textContent = pad(stats.score);
    this.el.finalBest.textContent = pad(stats.best);
    this.el.finalLevel.textContent = pad(stats.level, 2);
    this.el.finalKills.textContent = String(stats.kills);
    this.showScreen("over");
  }

  toast(text, kind = "", duration = 1500) {
    const el = this.el.toast;
    el.textContent = text;
    el.classList.remove("show", "danger", "cool");
    if (kind) el.classList.add(kind);
    void el.offsetWidth;
    el.classList.add("show");
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.classList.remove("show");
      this.toastTimer = null;
    }, duration);
  }

  flashDamage() {
    const el = this.el.damage;
    el.classList.remove("hit");
    void el.offsetWidth;
    el.classList.add("hit");
    if (this.damageTimer) clearTimeout(this.damageTimer);
    this.damageTimer = setTimeout(() => {
      el.classList.remove("hit");
      this.damageTimer = null;
    }, 520);
  }

  crosshair(x, y, visible, firing) {
    if (document.body.classList.contains("touch")) return;
    const el = this.el.crosshair;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.classList.toggle("show", visible);
    el.classList.toggle("fire", firing);
  }
}
