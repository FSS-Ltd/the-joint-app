# The Family Fund App — visual contract

Status: human-approved UI implementation baseline on 23 October 2026. The user explicitly approved applying the revised wireframes and this contract after AUTH2 merged. Approval of the baseline does not claim any production screen implemented.

The user's menu criticism refers to the existing app menu, not the navigation in these mockups. UI1 replaces that menu using the approved visual direction and links only to available features.

## Reference and intent

The eight private images in `Design/` supply the composition, not merely a colour mood. See [reference analysis](../decisions/design-direction.md). Adapt the mobile reference's deep backdrop, layered framing, opaque inset finance panels and floating capsule navigation. Adapt the desktop reference's dark navigation rail, optional account column, financial hierarchy and compact rows. Do not redistribute the source images, copy their branding or introduce payment capabilities.

The result should feel like a calm, purposeful household workspace. Mobile is the primary design. Desktop is a deliberate workspace adaptation, not an enlarged phone or a centred landing-page form.

## Tokens

| Token         | Value     | Role                                   |
| ------------- | --------- | -------------------------------------- |
| Forest ink    | `#203B32` | Dark shell, headings on light surfaces |
| Forest action | `#244F42` | Primary actions, selected emphasis     |
| Ivory         | `#F7F5EF` | Opaque content canvas                  |
| White         | `#FFFFFF` | Opaque finance panels, text on forest  |
| Sage          | `#DDE7DD` | Selected surfaces and quiet framing    |
| Apricot       | `#F0D6BC` | Goal and category emphasis             |
| Secondary ink | `#52665C` | Supporting text on light surfaces      |
| Border        | `#CCD5CC` | Decorative rules                       |
| Focus         | `#805A27` | Focus on light surfaces                |
| Error         | `#9C3838` | Labelled errors and exhausted caps     |

Use restrained abstract sage/apricot ribbons behind the mobile shell. Keep text-bearing financial panels opaque. Translucency belongs to framing and navigation, with a solid fallback. Avoid neon colours, pure-black panels and third-party artwork. Use system sans-serif typography, tabular amounts, 16px body text and 8px spacing increments. All content cards use a 6px radius. Form fields and primary/secondary actions use an 8px radius. Outer glass frames may use a 10px radius with an 8px inset. Touch targets remain at least 44px. No large oval or capsule content containers on any screen.

Only capsule navigation, its selected item, compact status chips and small icon-only circular controls may use full rounding. Primary and secondary text actions remain rectangular. This applies to every mobile and desktop screen following the user’s explicit all-screen correction. Generated text wordmarks and neutral profile glyphs are layout placeholders. Production screens use the approved assets in `apps/web/public/brand/` and `apps/web/public/app-icon.svg`; do not invent a replacement logo or add a font dependency from generated metadata.

Calculated opaque contrast pairs: forest/ivory 11.11:1, forest/sage 9.55:1, forest/apricot 8.68:1, secondary ink/ivory 5.64:1, error/ivory 6.34:1, white/forest 12.12:1 and white/action 9.24:1. These calculations do not certify generated screenshots or translucent composites; verify those in the actual implementation. Do not reduce text opacity to create secondary labels.

## Responsive composition

- Mobile: design at 390px, support 320–430px without page overflow. Use 16px gutters, a short brand header, clear account scope and a 28–36px page heading. A 36–44px principal amount anchors the screen. Preserve depth around the main inset panel rather than flattening every section into identical cards.
- Navigation: Home, Activity, Goals, Wealth, More. Use a floating capsule with a light selected inner pill. Every destination has a label and accessible name. Include safe-area padding and enough content clearance so navigation never covers content or keyboard focus.
- Tablet: at 768px, allow two content columns only where each remains readable.
- Desktop: at 1100px, use a 224px forest navigation rail, bounded content and an optional account-scope column. Put the summary first, related insights alongside each other and compact transactions below. Do not introduce a second account column on unrelated screens. All desktop financial panels, including the principal amount, account cards, analytics, notices and ledger, are standard rectangles with small corners (no more than 6px), never oversized ovals or capsules. The user explicitly rejected both the oval account cards and the heavily rounded amount summary. Reserve pills for small chips and navigation.
- Carry glass into desktop through translucent sage framing, fine highlight borders and layered account/summary framing. Keep financial content opaque and retain a solid fallback. Glass should be visible in the composition without reducing text contrast or turning the desktop into a phone mockup.
- Auth and setup: reuse the same forest shell, ivory inset panels, typography and actions. Retain the existing custom authentication flow. Partner invitation is optional; show Invite later clearly. Never bypass MFA or permissions for visual convenience.

## Required screen families

| Family                 | Required content and decisions                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Home                   | Visible account scope, CSV freshness, available amount, spending cap summary, saving plan, recent activity       |
| Accounts               | Owner/sharing labels, account list/detail, permitted totals only, Add account and Import CSV                     |
| Activity and imports   | Search/filter, signed amounts, import source, duplicate/validation feedback, review before commit                |
| Category caps          | Remaining amount, used/limit ruler, explicit zero and overspend states, saving-plan impact, month-end suggestion |
| Goals and review       | Shared goal name/target/date; permission-controlled funding; proposed allocations require confirmation           |
| Identity and household | Sign-in, signup, verification, MFA, errors and optional invitation in the same visual family                     |

All wireframe amounts, names and transactions are synthetic. Each frame must visibly say **Wireframe · Sample data**. No working-feature claims, invented live balances, bank connections, payments or investment execution. Child profiles and direct bank connectivity remain post-MVP.

### Existing route mapping

| Routes                                                      | Visual family                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/dashboard`                                                | Home overview and desktop workspace                                                          |
| `/accounts`, `/accounts/[id]`                               | Accounts, explicit scope and owner/sharing labels                                            |
| `/activity`, `/activity/[transactionId]`                    | Compact activity list and focused detail panel                                               |
| `/budgets`, `/review`                                       | Category caps, saving impact and month-end review                                            |
| `/imports`, `/imports/[batchId]`                            | Activity/CSV review, preserving preview-before-commit behaviour                              |
| `/household`, `/join`                                       | Household setup, with optional invitation where applicable                                   |
| `/sign-in`, `/sign-up`, `/recovery`, `/auth/*`, `/security` | Shared forest/ivory identity shell; retain each existing secure flow                         |
| `/archive`, `/settings/privacy`, `/privacy/deletion`        | The same scoped list/detail surfaces, with explicit confirmation, pending and receipt states |

The navigation labels express the product direction, not proof that every future destination exists. Implement links only to available routes. Goals, investment execution and other future capabilities need their own authorised functional work; these images do not supply it.

## Category cap semantics

For a £50 eating-out cap, £32 spent means £18 left. At £50 spent show **£0 left · Limit reached**, with red text/icon as well as colour. At £58 spent show **£8 over limit**. A gentle red pulse may draw attention when the state first changes; stop it under reduced motion and retain the static warning. Never use flashing or permanent distracting animation.

If a household's £200 saving plan assumes spending within its caps, show **£192 available for the saving plan, £8 below plan** after that £8 overspend. Label the calculation and its assumptions. Do not imply that money moved or subtract the same overspend twice. At month end, suggest reviewing any remaining allowance for a saving or investment allocation. Show a review/confirmation action, never an automatic transfer.

## States and accessibility

Specify loading, empty, stale/partial-history, offline, error and success states alongside the populated pattern. Hide amounts and account details when permission is absent; an event notification never grants access. Use server-authoritative permissions and scoped subscriptions when later implementing updates.

Use semantic headings and landmarks, a skip link, visible focus, keyboard operation and labelled icons. Never communicate ownership, privacy, gain/loss or cap state through colour alone. Provide readable chart summaries and equivalent tables. Check contrast for actual colour pairs, including translucent composites. Use a light high-contrast focus ring on dark surfaces. Respect 200% zoom, enlarged text and reduced motion.

## Source of truth and acceptance

The contract and accepted screen snapshots together define future UI work. A generated screen is a proposal until inspected and accepted; generated HTML is reference output, not production code or proof of accessibility. Record Stitch project/screen identifiers, local exports, known deviations and acceptance status in [the wireframe register](wireframes/README.md).

Before each UI delivery, compare real 390px and 1280px renders against the accepted family. Check 320px overflow, 200% zoom, keyboard focus, selected navigation, reduced motion, errors and privacy states. Correct drift before raising its PR. Do not declare a screen implemented based on the wireframe alone.
