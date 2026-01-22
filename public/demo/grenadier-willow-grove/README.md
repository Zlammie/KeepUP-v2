# Grenadier Homes Willow Grove Demo

Standalone mock community page for stakeholder preview. This is a demo only and does not touch the live Grenadier site.

## Run locally

From `demo/grenadier-willow-grove`:

```bash
npx serve .
```

Or:

```bash
python -m http.server
```

Then open the local URL shown in the terminal.

## KeepUp embed

The embed iframe points to (default):

```
https://app.keepupcrm.com/embed/map-group/willow-grove
```

To change it, edit the `src` on the iframe in `demo/grenadier-willow-grove/index.html`.

You can also override the embed source at runtime:

- `?embed=local` uses `http://localhost:3000/embed/map-group/willow-grove`
- `?embedUrl=https://your-host/embed/map-group/willow-grove` uses a custom URL

To switch back to local, set the iframe `src` in `demo/grenadier-willow-grove/index.html` to:

```
http://localhost:3000/embed/map-group/willow-grove
```

Note: the demo map frame is capped to 75vh (60vh on mobile) to avoid layout overflow. The iframe can scroll internally if the embed content exceeds that height.

## Fallback behavior

- The placeholder image shows if the iframe does not load within 4 seconds, errors, or appears blocked.
- Use the floating demo controls (top-right) to force showing the embed or placeholder.
