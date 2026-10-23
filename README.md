# Solitaire

A calm, modern Klondike Solitaire for desktop and mobile. Installable as a PWA, works offline.

- Main menu: Single Player or Multiplayer (two players, room code, peer to peer over WebRTC)
- Drag and drop, or just tap a card to send it where it belongs
- Draw 1 / Draw 3, undo, hints, auto-complete, resume where you left off
- Score rewards speed, few moves and streaks (see Scoring)
- Tells you when the game is stuck (no useful move left, even after cycling the stock)
- Light, dark, or follow the system, plus six background colours (Emerald, Ocean, Sunset, Rose, Lavender, Graphite)
- Switchable card designs (Classic, Modern, Midnight), easy to add your own
- Synthesised sound effects (no audio files)

## Run it

No build step. Serve the folder with any static server:

```sh
npm start          # python3 -m http.server 5173  ->  http://localhost:5173
npm test           # game-logic tests (Node 20+)
```

Service workers need `localhost` or HTTPS. To see an update during development, tick
**Update on reload** in DevTools → Application → Service Workers (or bump `CACHE_VERSION` in `sw.js`).

Keyboard: `U` undo · `H` hint · `N` new game · `Space` draw.

## Project layout

```
index.html            page + dialogs
css/                  base (tokens, layout) · backgrounds (palettes) · glass · board · dialogs
js/main.js            wires everything together
js/core/              rules, no DOM: klondike.js, scoring.js, solver.js, cards.js, rng.js   (tested in test/)
js/net/               multiplayer: protocol, host/guest match logic, WebRTC transport
js/ui/                board.js (layout, animation, drag & drop) · dialogs · hud · toast
js/services/          settings · sound · appearance (light/dark) · storage · pwa
js/cards/             card theme system  ←  see below
sw.js, manifest.webmanifest, icons/    PWA
```

## Adding a card design

There are two ways. Both end with **one line in [`js/cards/index.js`](js/cards/index.js)**, and the new
design shows up in Settings → Card design automatically (with a live preview).

### A. From images (no code)

1. Make a folder `assets/cards/my-deck/` with 52 images named `<rank><suit>.<ext>` plus `back.<ext>`:
   `AS.svg`, `10H.svg`, `KD.svg`, `QC.svg` … (rank `A 2–10 J Q K`, suit `S H D C`).
   SVG, PNG, WebP, JPG and AVIF all work. Keep a 5:7 ratio (e.g. 250 × 350).
2. Register it:

   ```js
   imagePack({ id: 'my-deck', name: 'My Deck', path: 'assets/cards/my-deck' }),
   ```

   (Use `ext: 'png'` for other formats, e.g. `imagePack({ …, ext: 'png' })`.)

### B. From code (SVG / HTML + CSS)

1. Copy [`js/cards/themes/_template.js`](js/cards/themes/_template.js) to `js/cards/themes/my-deck.js`.
2. Fill in `face(card)` and `back()`. They return an HTML/SVG string that is stretched to fill the card:

   ```js
   export default {
     id: 'my-deck',            // unique
     name: 'My Deck',          // shown in Settings
     face(card) { /* card: { id, suit, suitIndex, rank, label, color, name } */ return '<svg viewBox="0 0 250 350">…</svg>'; },
     back() { return '<div class="my-deck-back"></div>'; },
     css: `.my-deck-back { position: absolute; inset: 0; background: … }`,   // optional
   };
   ```

3. Register it:

   ```js
   import myDeck from './themes/my-deck.js';
   export const cardThemes = createRegistry([classic, modern, midnight, myDeck]);
   ```

Handy when drawing: `suit()`, `pips()`, `cardSvg()` and `flipped()` in [`js/cards/suits.js`](js/cards/suits.js)
(the Classic theme shows how they fit together), and `cqw` units in `css` (1cqw = 1 % of the card's width, so
the design scales at any size). Theme CSS is global, so prefix class names with your theme id.

## Adding a background colour

1. In [`css/backgrounds.css`](css/backgrounds.css) copy a palette (a dark block and a light block), change the id and colours.
2. Add `{ id, name }` to [`js/backgrounds.js`](js/backgrounds.js). It appears in Settings → Background.

## Multiplayer

Open **Multiplayer** from the menu. One player creates a room (and picks the mode), the other types the five-letter
room code, or opens the invite link ("Share Link"). Two players per room.

- **Race (PvP):** both get the same deal on their own table. First to clear it wins. You see each other's live score,
  moves and progress, never the other's cards. No undo.
- **Co-op:** one shared table, both players move the same cards. Either of you can draw, move and undo.
- Every multiplayer deal is checked with a solver, so it is always winnable.

How it works: the **host is the authority** ("listen server"). It picks the deal (just a seed, both sides build the
same cards from it), keeps the clock, replays every move the guest makes on its own copy of the game, corrects the
guest if their copy drifts, and decides who won. The guest applies its own moves right away so play feels instant.
All of this lives in `js/net/match.js` and is tested with an in-memory connection in `test/match.test.js`.

Connecting: WebRTC needs a go-between for the first handshake, so the room code is a peer id on the free public
[PeerJS](https://peerjs.com) broker. After that, game traffic goes straight between the two browsers. Notes:

- There is no TURN relay, so a few strict networks (some mobile carriers, corporate firewalls) can't connect.
- The public broker is a free service without guarantees. To run your own: `npx peerjs --port 9000`, then set
  `signal` in `js/net/config.js`, or just try it with `http://localhost:5173/?signal=localhost:9000`.
- A phone that locks its screen or switches apps may drop out of the match after ~12 seconds.
- `?debug` exposes `window.__app` (game, board, match) in the console.
- The PeerJS library is vendored in `vendor/` (MIT) and only loaded when you open Multiplayer.

## Scoring

Move by move (as before): waste to tableau +5, any card to a foundation +10, turning a card +5, foundation to tableau
−15, turning the waste over −100 (Draw 1) / −20 (Draw 3).

- **Streak:** every move that earns points extends a streak. At 5, 10, 15 … in a row you get a bonus of 5 × the
  streak (25, 50, 75 …). Drawing keeps the streak; a move that earns nothing (shuffling cards between columns,
  pulling one back from a foundation) or turning the waste over ends it.
- **Time bonus** when you clear the deal: 3000, halved every 4 minutes (2 min → ~2100, 4 min → 1500, 8 min → 750).
- **Move bonus:** 2000 for 80 moves or fewer, falling in a straight line to 0 at 260 moves.
- In a race the first to clear wins; the final tallies (with bonuses) are shown for both. If both players get stuck, the
  higher score wins. In co-op the team shares one score, time and move count.

The numbers live at the top of `js/core/scoring.js`.

## Notes

- Single player and multiplayer deals differ: single player is a plain random shuffle (some are unwinnable), multiplayer deals are verified winnable.
- Draw 3 keeps the card order when the stock is turned over again, but the first draw of each new pass takes 1, then 2,
  then 3 cards. That shifts the groups of three, so different cards come up each time round.
- "Stuck" means no productive move on the table (one that flips a hidden card, empties a column, or sends a card home)
  and none that any card reachable by cycling the stock would open.
- Cached assets are refreshed in the background, so an update appears on the *next* launch.
- Not every deal is winnable, as in any random Klondike.
