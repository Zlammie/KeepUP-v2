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

Note: the demo map frame is capped to 75vh (60vh on mobile) with minimum heights of 520px (desktop) / 420px (mobile) to avoid layout overflow. The iframe can scroll internally if the embed content exceeds that height.

## Mobile preview toggle

- Use the floating Preview toolbar (top-right) to switch between Desktop and Mobile.
- Mobile preview constrains the map to a 390x844 device frame and appends `?ui=mobile` to the embed URL.
- The selected mode is saved in localStorage so refresh keeps the same view.

## Embed UI override

- Add `?ui=mobile` to the embed URL to force the mobile layout even on wide screens.

## Manual test checklist

1. In the Preview toolbar, toggle Desktop and Mobile and confirm the label updates; Mobile shows 390x844.
2. When Mobile, confirm the device frame is centered and the page is dimmed.
3. When Desktop, confirm the iframe returns to the normal full-width layout and the dim overlay is gone.
4. In Mobile preview, confirm the iframe URL includes `ui=mobile` only once.
5. Switch back to Desktop and confirm `ui=mobile` is removed while other params remain.
6. In Mobile preview, tap a lot and confirm the panel auto-expands on first selection.
7. Collapse the panel manually, select another lot, and confirm it stays collapsed unless you expand it.
8. Confirm the "View Home" button is visible and tappable inside the panel.

## Fallback behavior

- The placeholder image shows if the iframe does not load within 4 seconds, errors, or appears blocked.
- Use the floating demo controls (top-right) to force showing the embed or placeholder.
