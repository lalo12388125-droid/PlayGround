# PAC·STRIKE

**3D Pac-Man with guns.** A neon maze arena shooter that runs in the browser.

He's round. He's hungry. He's packing heat. Eat every dot in the sector, light up the power pellets, and blast the ghosts before they eat you.

![Three.js](https://img.shields.io/badge/Three.js-r169-000?logo=three.js)
![No build step](https://img.shields.io/badge/build-none-38d9a9)
![Mobile ready](https://img.shields.io/badge/mobile-touch%20controls-ff3fbe)

## Play

The game is a static site with no build step. Serve the project folder over HTTP and open it in a modern browser:

```bash
# from the project root
python3 -m http.server 3002
# then open http://localhost:3002
```

Any static file server works (Node, nginx, GitHub Pages, etc.). Opening `index.html` directly from disk will not work because ES modules and import maps require HTTP.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | `WASD` / arrow keys | Left virtual stick |
| Aim | Mouse | Right virtual stick |
| Fire | Left click / `Space` | Push right stick past dead zone (auto-fire) |
| Pause | `P` / `Esc` | Pause button |
| Mute | `M` | Speaker button |
| Start / restart | `Enter` | On-screen buttons |

The HUD shows score, level, dots remaining, health hearts, and the FRENZY meter.

## What's in the game

- **Hand-built 21×21 neon maze** with four power pellets, outer corridors, and a glowing grid floor.
- **Armed Pac-Man** with twin front-mounted pistols, animated chomp, muzzle flash, tracers, and hit sparks.
- **Ghost pack AI** with BFS maze pathfinding, group separation, chase/flee states, respawns, and health.
- **FRENZY mode** — power pellets flip the hunt: ghosts turn blue, flee, and die in one hit. Chaining kills boosts score.
- **Ghost orbs** from sector 2 onward: ghosts only spit when they have a clear lane.
- **Progression** — clear the maze, bank a level bonus, and advance to faster, tougher sectors.
- **Game feel** — screen shake, hit flashes, damage vignette, floating score popups, synth sound effects, and ambient audio.
- **Responsive UI** — landscape and portrait layouts, safe-area padding, and touch controls for phones and tablets.

## Running locally

```bash
python3 -m http.server 3002
```

Then open <http://localhost:3002>. The game has no dependencies to install; Three.js and the fonts are vendored under `vendor/`, so it works offline after the first load.

## Project layout

```
index.html          DOM, HUD, menus, import map
styles.css          neon UI, overlays, touch controls, responsive rules
src/main.js         game loop, states, camera, bullets, scoring, frenzy
src/world.js        maze layout, geometry, pellets, pathfinding, collision
src/player.js       Pac-Man and gun model, movement, aiming, firing
src/ghosts.js       ghost visuals, AI, pathfinding, orbs, respawns
src/fx.js           particles, rings, muzzle flashes, shake, popups
src/input.js        keyboard, mouse, and virtual sticks
src/ui.js           HUD and screen state
src/audio.js        procedural WebAudio music and effects
src/textures.js     procedural floor, glow, and particle textures
vendor/             Three.js r169, Orbitron, Share Tech Mono, licenses
```

## Tech notes

- Rendering: Three.js r169 (ES modules, vendored), instanced maze and pellet geometry.
- Audio: WebAudio synthesizers only; no audio files.
- Persistence: best score is stored in `localStorage`.
- No post-processing bloom — glow is built from emissive materials, additive sprites, and neon edge strips to stay fast on integrated and mobile GPUs.
- Nintendo/Pac-Man is a trademark of its respective owner. This is a fan-made tribute, not an official product.

## Credits

- [Three.js](https://threejs.org/) — MIT license, see `vendor/three.LICENSE.txt`.
- [Orbitron](https://fonts.google.com/specimen/Orbitron) and [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono) — SIL Open Font License, see `vendor/fonts/`.

---

Built with [OMGithub](https://omgithub.com). [Open the project](https://omgithub.com/lalo12388125-droid/PlayGround) · [Remix it](https://omgithub.com/?remix=lalo12388125-droid%2FPlayGround) · [Source on GitHub](https://github.com/lalo12388125-droid/PlayGround)
