# gi-planetachira

This web page and CLI fetch a Genshin Impact profile and its showcase character builds from the [Enka.Network](https://enka.network) API. They can also list every owned character via HoYoLAB. It defaults to **Achira** (UID `635783945`, America server).

## Requirements

- Node.js 22 (see `.nvmrc`. Run `nvm use`.)

## Usage

### Web page

```sh
npm install
npm run serve                   # http://127.0.0.1:3000  (PORT / HOST env vars to change)
npm run dev                     # same, restarts on source changes
```

The page loads the default UID automatically. Use `?uid=<uid>` or the form to view another player. **Refresh** bypasses the cache. Character tabs support arrow keys, Home and End.

The server is required because Enka sends no CORS headers, so a browser can't call it directly. It exposes:
- `GET /api/profile/:uid` returns the normalized `Profile` JSON. Add `?refresh` to skip the cache and `&lang=ja` to change the language.
- `GET /api/roster/:uid` returns **all owned characters** from HoYoLAB (requires `HOYOLAB_COOKIE`). Add `?refresh` to skip the 5-minute cache.
- `GET /api/config` returns `{ defaultUid, rosterEnabled }`.
- `GET /api/artifacts/:uid` returns `{ equipped, inventory }`: live equipped artifacts from HoYoLAB plus the imported GOOD inventory (or `null`).
- `POST /api/inventory` (GOOD JSON body) / `DELETE /api/inventory` replaces or clears the imported inventory. These requests must have `Content-Type: application/json` and come from the page itself. Requests from other websites are rejected.

#### Viewing all characters (optional)

The showcase is limited to 12 characters. To list every character you own:

1. `cp .env.example .env`
2. Log in at [hoyolab.com](https://www.hoyolab.com). Open DevTools → Application → Cookies and copy `ltuid_v2`, `ltoken_v2` and `ltmid_v2` into `HOYOLAB_COOKIE`.
3. Restart the server.

The cookies are account credentials. `.env` is gitignored, and the server only listens on `127.0.0.1`. Your HoYoLAB account must be linked to the game account.

#### Artifacts page

`/artifacts` is a filterable, sortable table of artifacts. It sorts by crit value by default and shows roll counts for each substat.

- **Equipped on characters:** loaded live from HoYoLAB `character/detail` (requires the cookie above).
- **Full inventory:** no API exposes unequipped artifacts. To include them, export a [GOOD](https://frzyc.github.io/genshin-optimizer/#/doc) file with a scanner and import it on the page:
  - [Genshin Optimizer](https://frzyc.github.io/genshin-optimizer/) scanner
  - [Irminsul](https://github.com/konkers/irminsul)
  - [Inventory Kamera](https://github.com/Andrewthe13th/Inventory_Kamera)

  The import is saved locally to `.data/good.json` (gitignored). GOOD files don't include main-stat values, so the page calculates them from Enka's `relic_levels.json`.

### CLI

```sh
npm start                       # default UID
npm start -- 635783945          # specific UID (or set GENSHIN_UID)
npm start -- -c skirk           # one character
npm start -- --json             # normalized JSON
npm start -- --refresh          # bypass the local cache
npm test
npm run typecheck
```

Responses are cached in `.cache/`. Profiles are kept for Enka's `ttl` (usually 60s). Asset data is kept for 24h.

## API notes

HoYoverse has **no official public or developer API** for Genshin Impact. These are the realistic options:

| Source | Auth | What you get | Caveats |
| --- | --- | --- | --- |
| **Enka.Network** `GET https://enka.network/api/uid/{uid}` (used here) | None | Profile (AR, WL, achievements, Abyss, Stygian) plus full builds for **showcased characters only** (max 12) | Send a custom `User-Agent`. Respect `ttl`. Append `?info` to get `playerInfo` only. Errors: 400 bad UID, 404 unknown player, 424 maintenance, 429 rate limit, 500/503 server errors. |
| **HoYoLAB** `POST https://sg-public-api.hoyolab.com/event/game_record/genshin/api/character/list` with body `{role_id, server}` (used here for the full roster) | HoYoLAB cookies + `ds` header | All characters, real-time notes (resin, commissions), Abyss, diary, wish history | Unofficial and undocumented, so it can break without notice. Without cookies it returns retcode `10001` ("Please login"). Request details mirror [genshin.py](https://github.com/seriaati/genshin.py). Cookies are account credentials, so never commit them. |
| **genshin.dev** ([genshindev/api](https://github.com/genshindev/api), now hosted at `genshin.jmp.blue`) | None | Static game data (character/weapon/artifact descriptions, images) | **No player data**, so it can't tell you which characters you own. The old `api.genshin.dev` domain returns 502. |

Enka returns numeric IDs. Names come from Enka's asset store at
`https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi/` (`avatars.json`, `relics.json`, `locs.json`). The top-level `store/characters.json` and `store/loc.json` are **outdated** and miss newer characters.

Notes on the ID mapping:
- Traveler entries are keyed `"<avatarId>-<skillDepotId>"`.
- Artifact set names: `relics.json` → `Sets[setId].Name` → `locs[lang][hash]`.
- Weapon and character names: `nameTextMapHash` / `NameTextMapHash` → `locs[lang]`.
- `fightPropMap` percentages are fractions (`0.5` = 50%). Artifact `statValue` percentages are already ×100.

## Layout

- `src/enka.ts`: API client (User-Agent, error codes, TTL cache)
- `src/assets.ts`: downloads and caches Enka name/ID data
- `src/build.ts`: turns raw responses into `Profile` / `Character` objects (pure, tested)
- `src/format.ts`: text output
- `src/cli.ts`: CLI entry point
- `src/hoyolab.ts`: HoYoLAB client for the roster and character details (DS signing, UID → server, retcode errors)
- `src/artifacts.ts`: converts HoYoLAB relics and GOOD artifacts into one artifact format (pure, tested)
- `src/inventory.ts`: stores the imported GOOD inventory in `.data/`
- `src/server.ts`: web server (static pages + JSON API)
- `public/`: the pages (plain HTML/CSS/JS, no build step). `lib.js` holds shared helpers, `app.js` drives the profile page and `artifacts.js` drives the artifacts page.
