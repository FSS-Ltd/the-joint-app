# Mobile-first visual direction

Date: 23 October 2026. Product direction grounded in all eight supplied images in local `Design/`. This is a reference analysis and implementation brief; no product screen is claimed implemented.

## Reference synthesis

| Concept    | Observed traits                                                                                                                                     | Adaptation for The Joint App                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| NU.Finance | Dark navigation rail, distinct account list, prominent balance summary, restrained chart modules, dense transaction rows                            | Clear grouping and strong financial hierarchy; desktop sidebar and labelled account scope; readable lists and accessible chart alternatives |
| Payrix     | Large light headings, rounded opaque cards within translucent framing, comfortable mobile spacing, compact floating navigation, teal/orange artwork | Soft corners, generous touch spacing and restrained layered surfaces; mobile navigation with a text-labelled selected item                  |

NU.Finance references: `original-243d2a310326c22d99312b5d83b64b26.webp`, `original-d4d14a9accc97244f2a2a80460aa2022.webp`, `original-d6055ccfc73071eb00143af6b652ca06.png`.

Payrix references: `83faec9ab80ae31e189aa58f4c3682e9.webp`, `5721c7c76d62ee70cad3754e9276e70b.webp`, `13a4acb53f8a663051c5aaee5c54320d.webp`, `2e85a1e70d23eded5e0fcc2c7c75d224.webp`, `bfe125563348dbe8c5bd8aa41fd39b87.webp`.

These are third-party references retained locally, not redistributable product assets. Do not copy their branding, payment-card artwork, dollar fixtures, typography assets or transfer/payment actions. This app is a read-only organiser. There is no need for WebGL, GSAP or generated images for ordinary finance screens.

## Semantic palette

| Role           | Value   | Use                                               |
| -------------- | ------- | ------------------------------------------------- |
| Canvas         | #F7F5EF | Warm ivory background                             |
| Surface        | #FFFFFF | Opaque financial content                          |
| Primary ink    | #203B32 | Deep evergreen headings and body                  |
| Secondary ink  | #52665C | Labels and supporting text                        |
| Primary action | #244F42 | Evergreen buttons; white text                     |
| Soft accent    | #DDE7DD | Sage selected backgrounds; primary ink            |
| Warm accent    | #F0D6BC | Apricot goal/child highlights; primary ink        |
| Border         | #CCD5CC | Decorative separation; not sole control indicator |
| Focus          | #805A27 | Visible focus outline on light surfaces           |
| Negative/error | #9C3838 | Error text with explicit label/icon               |

Avoid neon yellow, hard black panels and full-screen saturated gradients from the references. Use warm accents to make the product welcoming without gender-coding ownership. Optional translucency is limited to navigation framing; financial text always has an opaque background. Provide an opaque fallback when blur is unsupported. Check actual foreground/background pairs at implementation, including hover, selected and focus states.

## Responsive layout and hierarchy

- Design at 360–430px first. Use a single content column, 16px side gutters, 16px base text and at least 44px interactive targets. Support 320px without horizontal page scrolling.
- Use 24px card radii, 12px control radii, 8px spacing increments and restrained shadows. Use system sans-serif text, clear medium-weight headings and tabular numerals for aligned amounts. Currency and signs stay explicit.
- Mobile navigation follows the product spec: Home, Activity, Goals, Wealth and More. Text labels remain available for every item. Account scope and freshness precede financial figures; sharing state sits beside account labels.
- At 768px, use two columns only when content remains readable. At 1100px, add a 224px navigation rail and bounded main content. An optional account column appears only on account-focused screens. Do not shrink a three-column desktop composition onto a phone.
- Use a 28–36px page heading on phones and a 32–44px key total. Secondary values remain subordinate. A household total must never imply visibility of hidden accounts or mix adult-spendable and child-owned assets.
- Charts accompany text totals and accessible tables. Do not use colour alone for owner, gain/loss, category or sharing. Keep transaction lists readable before introducing charts.

## Interaction and states

Use semantic navigation, a skip link, visible focus and keyboard-operable menus/dialogs. Sticky mobile navigation respects safe areas and never obscures focused content. Keep zoom/enlarged text usable.

Each delivered screen includes its relevant loading, empty, partial-history, stale-source, offline, validation, pending, success and error states. Account permission, privacy and entitlement decisions are server-authoritative. Empty finance screens offer a real next action only when that action exists; no inert controls or simulated connections.

Transitions are brief (120–180ms), limited to opacity/transform when useful, and disabled under reduced motion. No ambient animation competes with financial data. Family language is supportive and neutral; no spending leaderboards or partner blame.

## Acceptance for every UI delivery

Inspect real browser renders at 390px and 1280px; check 320px overflow, 200% zoom, keyboard focus, selected navigation and reduced motion. Compare the actual screen with both reference concepts and this direction. Verify text contrast, form feedback, privacy labels, chart alternatives and all relevant failure states. Use synthetic labelled data until real-data gates pass. Do not claim a visual review from source inspection alone.
