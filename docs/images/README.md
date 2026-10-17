# Reproducible screenshots

Captured from the actual local production build in explicitly fictional demo mode: homepage 1440 x 1100, topic 1440 x 1560. No live evidence or benchmark result is depicted.

Run `npm run build`, then `npm run screenshot` (Chromium must be installed via `npx playwright install chromium`). The script starts/stops its own demo-only server, checks the public model, overflow and masthead position, waits for fonts and the topic chart, and records the real rendered pages without image generation.
