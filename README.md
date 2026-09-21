# Rush Bracket

A single-page app for ranking Rush studio songs. Pick a pool, play head-to-head or a bracket, then share your favorite, your top 10, your least favorite, and your bottom 10.

The catalog is the 19 studio albums from **Rush** (1974) through **Clockwork Angels** (2012): 165 songs. Live albums, compilations, and the *Feedback* covers EP are not included.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

```bash
npm test
npm run build
npm run preview
```

## How a run works

Before you start, drop whole albums or individual songs. Every exclusion is reversible with **Restore full discography**, and the choice is kept in this browser.

Two play modes produce the same kind of result:

- **Swipe** — one matchup at a time. Tap a song or flick it sideways. Keys `1` and `2`, `Z` to undo.
- **Bracket** — a randomly seeded board. Each heat shows every open pairing. Tap a winner.

Depth:

| Depth | What it does | Full discography, roughly |
| --- | --- | --- |
| Quick | A few Swiss rounds, then one ordering pass over the top and bottom | ~180 matchups |
| Standard | More rounds and a longer pass on both ends | ~390 matchups |
| **Full** (default) | A complete ranking. Every song gets a place from favorite to least favorite | ~1,050 matchups |

Small pools use a complete ranking even on Quick or Standard, because it is short. Progress is saved in `localStorage` until the run finishes. You can leave and resume on the same device.

Full mode is a pairwise merge of the shuffled pool, so the final order is a real total ranking. Quick and Standard keep wins, opponent strength, and an Elo tiebreak, then bubble the top and bottom so both ends are earned by direct picks.

## Sharing

The results screen has a link, a text summary, the system share sheet, and a downloadable card. The link is a hash (`#r=...`) with the ranking encoded in the URL. There is no account and no server. Opening the link shows that result and a **Rank yours** button.

Album artwork is bundled with the app, so the card and the matchups work offline after the first load.

## Catalog

`src/data/catalog.json` is the studio list. Titles come from official MusicBrainz releases (suites stay one song, with movement names as a subtitle). Square covers in `public/covers/` come from the [Cover Art Archive](https://coverartarchive.org/). Artwork is included so friends can tell the albums apart; copyright stays with the rights holders.

## Deploy on Cloudflare Pages

The project is a static Vite build. `wrangler.jsonc` points Pages at `dist/`, and `public/_redirects` sends unknown paths back to `index.html`.

1. Build and deploy:

   ```bash
   npx wrangler login
   npm run deploy
   ```

   `npm run deploy` runs `npm run build`, then:

   ```bash
   npx wrangler pages deploy dist --project-name rush-bracket
   ```

2. The first deploy creates the Pages project if your account is allowed to. You can also create it in the dashboard and connect this repo with:

   - Build command: `npm run build`
   - Output directory: `dist`

3. Share links are hashes on that origin, so they work on the Pages URL with no extra config.

If `wrangler` is not logged in, the app is still ready to deploy. Run the commands above from a machine that has Cloudflare auth.
