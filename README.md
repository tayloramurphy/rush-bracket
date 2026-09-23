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

- **Swipe** — one matchup at a time. Tap the song you like more, or flick it sideways. Keys `1` and `2`, `Z` to undo.
- **Bracket** — a winners bracket, then a second-chance losers bracket, then a short final cut (top 20 on Full, smaller on Quick and Standard). Early one-and-done exits settle the bottom. Pools of about 20 songs or fewer are a single playoff. Every tap is still the song you like more. The app places favorites and least favorites from those picks. Each match is a pair of slots joined by lines to the next round. The song you like moves along the line; an empty slot says TBD, centered in that slot. The match you’re on stays pinned at the top, with a line explaining the current bracket. Drag to pan, and zoom if the field is large. Switch trees with the tabs. **How this works** lists all four brackets. After the results card, **View bracket** reopens the finished trees.

Depth:

| Depth | Swipe | Bracket |
| --- | --- | --- |
| Quick | A few Swiss rounds, then one ordering pass over the top and bottom (~180) | Winners, a shorter losers path, then a top-10 cut |
| Standard | More rounds and a longer pass on both ends (~390) | The same path, with a top-16 cut |
| **Full** (default) | A complete ranking, favorite to least favorite (~1,050) | Winners, losers, then a top-20 cut |

Small pools use a complete ranking even on Quick or Standard, because it is short. Progress is saved in `localStorage` until the run finishes. You can leave and resume on the same device.

Swipe Full is a pairwise merge of the shuffled pool, so the final order is a real total ranking. Swipe Quick and Standard keep wins, opponent strength, and an Elo tiebreak, then bubble the top and bottom. Bracket mode follows a sports bracket: winners drop losers out of that path, those losers get a second-chance tree, and the survivors are reseeded into a final cut that crowns the favorite and the top of the list. Songs that lose their first real match play a simpler bottom bracket for least favorite. It is not a full sort of every song.

## Sharing

The results screen has a link, a text summary, the system share sheet, and a downloadable card. The link is a hash (`#r=...`) with the ranking encoded in the URL. There is no account and no server. Opening the link shows that result and a **Rank yours** button.

Album artwork is bundled with the app, so the card and the matchups work offline after the first load.

## Catalog

`src/data/catalog.json` is the studio list. Titles come from official MusicBrainz releases (suites stay one song, with movement names as a subtitle). Square covers in `public/covers/` come from the [Cover Art Archive](https://coverartarchive.org/). Artwork is included so friends can tell the albums apart; copyright stays with the rights holders.

## Deploy on Cloudflare Pages

The project is a static Vite build. `wrangler.jsonc` points Pages at `dist/`. Share links are hashes on `/` (`/#r=...`), so the site does not need a rewrite rule.

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
