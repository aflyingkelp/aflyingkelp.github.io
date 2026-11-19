# Fresh

A responsive video discovery site with live YouTube search, on-page embedded playback, topic filters, shuffled picks, and browser-local saved videos. Search loads 50 results per batch, with a Load more videos button for additional pages.

## Community and recommendations

Public chat uses the provisioned D1 `DB` binding and migrations under `drizzle/`. It supports video attachments, guest nicknames, deleting your own messages, and reporting messages. Ownership is checked using a hash of a browser-generated random token; names are not proof of identity. Repeated reports from the same guest count once; three distinct guest reports hide a message. Chat polls every five seconds and retrieves the most recent 80 visible messages. Text is rendered as text, with limits and server-side posting throttles.

Shorts searches for short-form videos and filters video durations to three minutes or less. The vertical feed uses one active official YouTube embed, with swipe/scroll, previous/next, likes, and sharing. Playback starts muted when the browser allows autoplay.

Fresh has its own recommendation ranker, not YouTube's private algorithm. Local watch time, completions, early skips, likes, saves, and not-interested signals influence topic and channel scores. The ranker reduces already-watched videos, varies channels, and reserves exploration slots. Signals stay in this browser and can be cleared with Reset recommendations.

Live site: https://fresh-play-okay-x20.a-flying-kelp.chatgpt.site

## Run locally

Requires Node.js 20 or later. No packages need installing.

```sh
node scripts/build.mjs
node scripts/check.mjs
node scripts/check-social.mjs
node scripts/preview.mjs
```

Open http://127.0.0.1:4173. The local preview uses an in-memory SQLite database for chat so test messages never enter the public room. Search and Shorts read from the public backend without local API credentials. Node.js 24 is needed for the local SQLite helper. To regenerate migrations after schema changes, run `npm install` and `npm run db:generate`.

## Live search

Enable YouTube Data API v3 in a Google Cloud project. Restrict an API key to that API. Configure `YOUTUBE_API_KEY` as a secret in the hosting environment, then redeploy. Never commit the key or add it to frontend code. Search requests go to `/api/search`; the server calls Google's official YouTube API and returns embeddable video results.

Search consumes the project's YouTube API quota. The UI reports missing configuration, quota exhaustion, and request failures.

## Deployment

### GitHub Pages

`node scripts/build-pages.mjs` creates a static frontend in `pages/`. Publish its five files under `fresh/` on the Pages publishing branch. The site is available at `/fresh/`. Search, Shorts, and chat automatically call the public Fresh backend; visitors do not need keys, accounts, or configuration. The backend holds `YOUTUBE_API_KEY` as a runtime secret, allows the Pages origin through CORS, caches repeated searches for ten minutes within each server instance, and limits uncached requests per IP within each instance. Pasted video links and curated videos also play in the page.

### OpenAI Sites

`node scripts/build.mjs` creates a Cloudflare-compatible Worker module at `dist/server/index.js`, including the frontend assets. The Worker default export implements `fetch(request, env)`. `.openai/hosting.json` identifies the existing private OpenAI Site.

Source files live in `web/` and `worker/`; generated files under `dist/` are ignored. `scripts/check.mjs` checks routes and mocks Google responses to test result mapping and quota errors without using API quota.

Playback uses YouTube's official embedded player. Availability depends on the video's embedding permissions and the viewer's network. Saved videos are stored in the current browser's local storage.
