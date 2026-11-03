# Bytes Simplified — site refresh

A dark, cinematic redesign of bytessimplified.com. One particle scene sits behind
the whole page and changes shape as you scroll. Each shape stands for one section
of the business:

| Section | Shape | Idea |
| --- | --- | --- |
| Hero | sphere → **tree** rising out of rippling water | an idea growing into something real |
| What we do | tree with platform chips orbiting its base | where we ship |
| Services | glass **cube** with "Bytes Simplified" and the pixel mark on its faces | engineered products |
| About | **ball of yarn** (five knotted loops) | "the tangle of modern technology" |
| Approach | **pipeline**: four nodes lined up with the four step cards | Discover → Design → Build → Launch |
| Products | **phone** with an app grid and a floating notification | apps on the App Store and Google Play, web platforms, CRMs |
| Contact | the Bytes Simplified **pixel mark**, built from particles | the brand, simplified |

There is no build step. It is a plain static site, deployed the same way as the current one.

## Files

```
index.html              Home page (all sections)
privacy.html            Privacy policy (wording unchanged from the live site)
terms.html              Terms of service (wording unchanged from the live site)
assets/css/site.css     All styles
assets/js/scene.js      Particle engine: WebGL2 with WebGL1 fallback, no dependencies
assets/js/app.js        Page behaviour: reveals, scroll → scene, menu, form, cursor
assets/fonts/           Fraunces, Geist, Geist Mono, Geist Pixel (self-hosted, SIL OFL — see OFL.txt)
assets/img/             Favicons, og.jpg (social share image)
assets/logo*.png        Original logo lockups (kept at their old URLs)
assets/favicon.svg      Vector pixel mark
```

## Run locally

```sh
cd bytes-refresh
python3 -m http.server 4173
# open http://localhost:4173
```

## Deploy

The live site runs on **Cloudflare Pages**: responses come from Cloudflare with Pages'
default `cache-control`, and `/privacy.html` redirects to `/privacy`. A Pages upload
**replaces the whole site** with this folder. That's safe here:

- `privacy.html` and `terms.html` are included, so `/privacy` and `/terms` keep working.
- `assets/logo.png` and `assets/logo-white.png` stay at their old paths, which the
  previous social and schema metadata used.
- `robots.txt` is Cloudflare's managed "content signals" file, served by the zone itself.
  Don't add one here unless you want to change it.
- Section IDs (`#services`, `#about`, `#process`, `#work`, `#contact`) are unchanged,
  so existing deep links keep working.

Two ways to publish:

1. **Dashboard:** Workers & Pages → the bytessimplified project → *Create deployment* →
   upload this folder. If something looks wrong, *Deployments* → previous → *Rollback*.
2. **CLI:** `npx wrangler login`, then deploy a preview first:
   `npx wrangler pages deploy . --project-name=<project> --branch=preview`
   (gives a `*.pages.dev` link to check on a phone), and once happy:
   `npx wrangler pages deploy . --project-name=<project> --branch=main`.

If the Pages project is connected to a Git repo, commit these files to that repo instead.

## Editing

- **Copy:** plain HTML in `index.html`. Headings with `class="split"` get the
  letter-by-letter blur-in automatically. Keep any line breaks as `<br>`.
- **Scene framing per section:** the `SCENES` table at the top of the scene section in
  `assets/js/app.js`. Each entry sets the camera, the shape offset, the scale, floor
  brightness and particle opacity. The scene blends between neighbouring sections as
  you scroll. `NARROW` overrides the framing on phones.
- **Nav links:** each section's cards are marked `data-land`. Clicking Services, Approach or
  Products scrolls so those cards are fully on screen (not just to the section's top edge);
  every "Start a project" link lands on the project brief (`#contact`).
- **Project brief (contact form):** sends straight to info@bytessimplified.com through
  [FormSubmit](https://formsubmit.co) — free, no account. **One-time setup:** the first
  enquiry sent from the live site makes FormSubmit email info@bytessimplified.com an
  "Activate Form" link; click it and every enquiry after that arrives in the inbox. Until
  then (or if FormSubmit is ever down) the visitor sees a fallback that opens their email
  app with the brief filled in, or copies it. The address lives in the form's `action`.
  A hidden `_honey` field quietly drops spam bots.
- **Pause animation:** the footer's "Pause animation" button stops the background. It is
  required for accessibility (WCAG 2.2.2), so keep it.

## Performance and accessibility

- **Particle count:** 62k on desktop, 26k on phones and tablets, 30k on low-memory
  devices. Pixel ratio is capped at 1.5. Rendering stops while the tab is hidden.
- **Adaptive quality:** if frames run slow, the engine lowers resolution, then particle
  count, then turns off reflections. Add `?adaptive=off` to the URL to disable this when testing.
- **Reduced motion:** visitors with *prefers-reduced-motion* get a still scene and no
  reveal animations or custom cursor. "Play animation" in the footer lets them opt in.
- **No animated blur:** reveals fade and slide; headings fake a blur-in with a text glow.
  Animating `filter: blur()` on many elements crashed WebKit, so don't bring it back.
- **Pause animation** in the footer stops the scene for everyone (WCAG 2.2.2).
- **Draw order:** particles, then stars, then the water floor. Drawing the floor before
  the big particle pass hung AMD Radeon 890M GPUs (Mesa 26), so keep this order.
- **No WebGL** (or a lost GPU context): the page falls back to a static gradient backdrop
  and all content still works. If the browser restores the context, the scene rebuilds.
- Headings in split text get a visually hidden plain-text copy for screen readers. The
  mobile menu makes the page behind it `inert` and closes on Esc.

## Fonts

The type system is the original site's: **Fraunces** for headlines (italic accents in
blue), **Geist** for body copy and **Geist Mono** for labels. **Geist Pixel** is kept for
comparison: add `?font=pixel` to the URL to see the anchor-ai-style pixel headlines.

Fraunces is © The Fraunces Project Authors; Geist, Geist Mono and Geist Pixel are © The
Geist Project Authors. All are licensed under the SIL Open Font License 1.1
(`assets/fonts/OFL.txt`) and self-hosted, so the site makes no third-party font requests.
