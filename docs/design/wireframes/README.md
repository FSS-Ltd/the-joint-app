# Wireframe register

Status: six self-reviewed proposals, revised following the user's all-screen rectangular-card correction. Human approval and application redesign are not claimed.

Private Stitch project: `projects/16873688144152014118`, **The Family Fund App — canonical wireframes**. Project creation returned `visibility: PRIVATE`.

The [visual contract](../DESIGN.md) defines the palette, reference interpretation, screen families and acceptance checks. The original images remain in ignored local `Design/`; they are not published here. Stitch receives a description of their observed layout traits, not private household data, source images or credentials.

| Frame                                   | Device  | Snapshot                        | Editable reference              |
| --------------------------------------- | ------- | ------------------------------- | ------------------------------- |
| Home overview                           | Mobile  | [Home](home-mobile.png)         | [Source](sources/home.html)     |
| Home workspace                          | Desktop | [Desktop](home-desktop.png)     | [Source](sources/desktop.html)  |
| Accounts and permissions                | Mobile  | [Accounts](accounts-mobile.png) | [Source](sources/accounts.html) |
| Category caps and saving impact         | Mobile  | [Caps](caps-mobile.png)         | [Source](sources/caps.html)     |
| Activity and CSV review                 | Mobile  | [Activity](activity-mobile.png) | [Source](sources/activity.html) |
| Household setup and optional invitation | Mobile  | [Setup](setup-mobile.png)       | [Source](sources/setup.html)    |

Every frame must label synthetic figures as sample data. Exported designs are proposals; production implementation must preserve existing authentication, permissions and financial semantics.

## Canonical files

Open [the review gallery](index.html), or use the local preview at `http://127.0.0.1:3100/wireframes/` while its server is running. The app remains separately available on port 3000.

The local HTML, [shared geometry stylesheet](geometry.css) and snapshots are the canonical review artifacts. Stitch's DOM-edit event reported button changes while its downloaded HTML still contained earlier pill styles. Local sources therefore explicitly mark cards, actions and glass frames with `data-wf-shape`, applying the shared 6px/8px/10px rules. The Stitch design system was also updated to the rectangular direction. [The manifest](manifest.json) records source screen IDs and exact file hashes; these references do not imply that every remote export contains the local refinements.

Sources retain compiled styling but contain no scripts. Editable previews use Google's Material Symbols font; the PNG gallery requires no external fonts or scripts. Generated HTML is a design reference, not an approved production component. Future implementation uses repository components and tokens, not a copied CDN-based application.

All six final renders were visually inspected for rectangular financial panels, rectangular actions, retained glass, explicit scope and sample-data labelling. The £50 cap includes within-limit, zero-left and £8-over states; the saving calculation is £200−£8=£192. Setup separates email verification from authenticator setup and keeps partner invitation optional. The original source images remain private.

This does not verify working authentication, live balances, full accessibility or every production state. The actual app must still pass the acceptance checks in the visual contract, including zoom, keyboard flows, permission boundaries and reduced motion. No app restyle, deployment, subsequent runtime unit or human approval is recorded here.

Further variants suggested by Stitch include a cap-edit modal and an Activity empty state. These are suggestions, not implemented features or authorised next build steps.
