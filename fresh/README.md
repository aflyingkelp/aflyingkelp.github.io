# Fresh

A responsive video discovery site with live YouTube search, on-page embedded playback, topic filters, shuffled picks, and browser-local saved videos. Search loads 50 results per batch, with a Load more videos button for additional pages.

Live site: https://fresh-play-okay-x20.a-flying-kelp.chatgpt.site

## Run locally

Requires Node.js 20 or later. No packages need installing.

```sh
node scripts/build.mjs
node scripts/check.mjs
node scripts/preview.mjs
```

Open http://127.0.0.1:4173. The local preview deliberately has no API credentials: it searches the curated collection and supports pasted YouTube video links.

## Live search

Enable YouTube Data API v3 in a Google Cloud project. Restrict an API key to that API. Configure `YOUTUBE_API_KEY` as a secret in the hosting environment, then redeploy. Never commit the key or add it to frontend code. Search requests go to `/api/search`; the server calls Google's official YouTube API and returns embeddable video results.

Search consumes the project's YouTube API quota. The UI reports missing configuration, quota exhaustion, and request failures.

## Deployment

### GitHub Pages

`node scripts/build-pages.mjs` creates a static frontend in `pages/`. Publish those four files as `fresh/index.html`, `fresh/app.js`, `fresh/style.css`, and `fresh/pages-client.js` on the Pages publishing branch. The site is available at `/fresh/`. Use **Connect search** to enter a YouTube Data API key. It stays in the current tab's session storage and is sent directly to Google's API, never committed to GitHub. Each new browser session needs a key. Pasted video links and curated videos work without a key.

### OpenAI Sites

`node scripts/build.mjs` creates a Cloudflare-compatible Worker module at `dist/server/index.js`, including the frontend assets. The Worker default export implements `fetch(request, env)`. `.openai/hosting.json` identifies the existing private OpenAI Site.

Source files live in `web/` and `worker/`; generated files under `dist/` are ignored. `scripts/check.mjs` checks routes and mocks Google responses to test result mapping and quota errors without using API quota.

Playback uses YouTube's official embedded player. Availability depends on the video's embedding permissions and the viewer's network. Saved videos are stored in the current browser's local storage.
