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

Note: the demo map frame is capped to 75vh on desktop and 45vh on mobile, with minimum heights of 520px (desktop) / 320px (mobile), to keep the section usable above the fold.

## Responsive behavior

- Desktop (`>= 900px`): the map is shown inline in the Community Map section.
- Mobile (`< 900px`): an inline map preview is shown with a `Tap to expand map` overlay; tapping opens a full-screen map modal.
- Mobile modal automatically uses `ui=mobile`.
- Desktop inline map uses the same embed URL without forcing `ui=mobile`.

## Embed UI override

- Add `?ui=mobile` to the embed URL to force the mobile layout even on wide screens.

## Map modal

- Modal includes a title bar and close button.
- Press `Escape` or tap the backdrop to close.
- While open, page scroll is locked with a `no-scroll` body class.
- If viewport resizes to desktop while modal is open, it closes automatically.

## Optional dev controls

- Dev controls are hidden by default.
- Add `?devtools=1` (or `?devTools=1`) to show the `Show Embed / Show Placeholder` controls.

## Manual test checklist

1. Desktop width (`>=900px`): inline map is fully interactive and no tap overlay appears.
2. Mobile width (`<900px`): inline map preview is visible with a tap overlay.
3. On mobile, open the modal and confirm map fills the viewport, then close via `X`.
4. On mobile, open modal and close via `Esc` key and by tapping backdrop.
5. While modal is open on mobile, background page should not scroll.
6. Resize mobile to desktop while modal is open and confirm modal closes and inline map appears.
7. Confirm modal iframe URL includes `ui=mobile` and desktop inline URL does not.
8. Confirm mobile header + promo consume less vertical space than before.

## Fallback behavior

- The placeholder image shows if the iframe does not load within 4 seconds, errors, or appears blocked.
- Use the floating demo controls (top-right) to force showing the embed or placeholder.
