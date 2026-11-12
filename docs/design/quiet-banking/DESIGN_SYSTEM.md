# Stitch design system (proposal)

Generated reference from the Quiet Banking Stitch project. It is pending review and does not replace [the approved design baseline](../DESIGN.md).

---

name: Family Fund
colors:
surface: '#fbf9f3'
surface-dim: '#dcdad4'
surface-bright: '#fbf9f3'
surface-container-lowest: '#ffffff'
surface-container-low: '#f5f3ed'
surface-container: '#f0eee8'
surface-container-high: '#eae8e2'
surface-container-highest: '#e4e2dd'
on-surface: '#1b1c18'
on-surface-variant: '#424845'
inverse-surface: '#30312d'
inverse-on-surface: '#f3f1eb'
outline: '#727975'
outline-variant: '#c1c8c4'
surface-tint: '#48645a'
primary: '#09251d'
on-primary: '#ffffff'
primary-container: '#203b32'
on-primary-container: '#88a599'
inverse-primary: '#afcdc0'
secondary: '#3c6658'
on-secondary: '#ffffff'
secondary-container: '#bbead8'
on-secondary-container: '#406b5d'
tertiary: '#2c1e0e'
on-tertiary: '#ffffff'
tertiary-container: '#433321'
on-tertiary-container: '#b29b83'
error: '#ba1a1a'
on-error: '#ffffff'
error-container: '#ffdad6'
on-error-container: '#93000a'
primary-fixed: '#cbe9dc'
primary-fixed-dim: '#afcdc0'
on-primary-fixed: '#042018'
on-primary-fixed-variant: '#314c43'
secondary-fixed: '#beecdb'
secondary-fixed-dim: '#a3d0bf'
on-secondary-fixed: '#002118'
on-secondary-fixed-variant: '#234e41'
tertiary-fixed: '#f8dec4'
tertiary-fixed-dim: '#dbc2a9'
on-tertiary-fixed: '#261909'
on-tertiary-fixed-variant: '#554430'
background: '#fbf9f3'
on-background: '#1b1c18'
surface-variant: '#e4e2dd'
typography:
display-lg:
fontFamily: Space Grotesk
fontSize: 40px
fontWeight: '600'
lineHeight: 48px
letterSpacing: -0.03em
display-lg-mobile:
fontFamily: Space Grotesk
fontSize: 34px
fontWeight: '600'
lineHeight: 40px
letterSpacing: -0.025em
headline-lg:
fontFamily: Space Grotesk
fontSize: 26px
fontWeight: '600'
lineHeight: 32px
letterSpacing: -0.02em
headline-md:
fontFamily: Space Grotesk
fontSize: 20px
fontWeight: '500'
lineHeight: 26px
letterSpacing: -0.015em
headline-sm:
fontFamily: Manrope
fontSize: 17px
fontWeight: '600'
lineHeight: 22px
letterSpacing: -0.01em
body-lg:
fontFamily: Manrope
fontSize: 16px
fontWeight: '400'
lineHeight: 24px
body-md:
fontFamily: Manrope
fontSize: 14px
fontWeight: '400'
lineHeight: 20px
body-sm:
fontFamily: Manrope
fontSize: 13px
fontWeight: '400'
lineHeight: 18px
label-md:
fontFamily: Manrope
fontSize: 12px
fontWeight: '600'
lineHeight: 16px
letterSpacing: 0.02em
label-sm:
fontFamily: Manrope
fontSize: 11px
fontWeight: '600'
lineHeight: 14px
letterSpacing: 0.04em
numeric-hero:
fontFamily: Space Grotesk
fontSize: 40px
fontWeight: '700'
lineHeight: 44px
letterSpacing: -0.03em
numeric-table:
fontFamily: Manrope
fontSize: 15px
fontWeight: '600'
lineHeight: 20px
letterSpacing: -0.01em
rounded:
sm: 0.125rem
DEFAULT: 0.25rem
md: 0.375rem
lg: 0.5rem
xl: 0.75rem
full: 9999px
spacing:
gutter: 1.5rem
gutter-compact: 1rem
margin: 1.5rem
margin-mobile: 1.5rem
space-xs: 0.25rem
space-sm: 0.5rem
space-md: 1rem
space-lg: 1.5rem
space-xl: 2rem
---

## Brand & Style

This design system defines an understated, heirloom-grade household wealth ledger. Built around intentional manual tracking and CSV import transparency, the visual philosophy rejects transactional fintech noise—there are no speculative assets, gamified rewards, or volatile tickers. The emotional target is domestic quietude, absolute balance transparency, and quiet structural authority.

The aesthetic synthesizes modern Swiss-inspired fintech clarity (evocative of high-end editorial banking tools) with tactile paper-like warmth. It relies on architectural discipline: generous margins, uncompromising tabular alignment, quiet hairline boundaries, and deep coniferous greens that replace stark black ink. Every screen functions as a private, shared sanctuary for household finance.

## Colors

The palette is anchored on high-ratio legibility and restrained botanical tones on warm paper.

- **Canvas & Background (`#F7F5EF`):** Dominates 85–90% of the viewport. A warm ivory background that reduces eye strain and avoids the sterile glare of pure digital white.
- **Surface Panels (`#FFFFFF`):** High-clarity white reserved for structural content cards, modal sheets, and inset ledger containers.
- **Primary Ink (`#203B32`):** A dense forest green used for heavy typographic balances, hero totals, section titles, and critical values. Serves as our absolute visual anchor instead of pitch black.
- **Action Primary (`#244F42`):** A saturated deep forest tint reserved strictly for primary touchpoints, active segmented states, and confirmed actions.
- **Secondary Ink / Muted (`#52665C`):** Mid-tone sage gray calibrated for contextual metadata, CSV timestamp indicators, secondary ledger columns, and inactive labels.
- **Accent Muted / Fill (`#DDE7DD`):** Soft sage wash used for household scope pills, table header tints, and tag containers.
- **Accent Warm (`#F0D6BC`):** Soft apricot deployed with extreme discipline for target thresholds, goal milestones, and visual completion markers.
- **Borders & Hairlines (`#CCD5CC`):** Crisp 1px (or 0.5px on Retina displays) boundary strokes that divide ledger items without visual bulk.
- **Alert / Destructive (`#9C3838`):** Muted madder red for budget overages, negative balance deltas, and delete operations.

## Typography

Typography establishes an unwavering financial cadence. `Space Grotesk` delivers technical rigor and modern precision for large totals, section headers, and category breakdowns, while `Manrope` governs data density, subtitles, body records, and metadata.

### Tabular Formatting

All monetary figures, decimal values, and dates must be displayed using tabular lining numbers (`font-variant-numeric: tabular-nums;` or `font-feature-settings: "tnum" 1`). This prevents balance jitter on filter changes and preserves vertical alignment across ledger columns.

### Freshness Metadata & Labels

CSV freshness stamps (e.g., "Updated 12 Nov via CSV") and household member identities (e.g., "Shared", "Alex", "Sam") utilize uppercase or tracked `label-sm` weights in `#52665C`, pairing low visual weight with high utility.

## Layout & Spacing

The layout is built upon an 8px spatial grid, prioritized for iOS native safe boundaries and generous editorial margins.

- **Outer Margins:** Canvas screen boundaries adhere to a strict `24px` (`1.5rem`) margin on both iPhone portrait orientations, establishing a confident framing border around content blocks.
- **Card Gutters:** In multi-panel views or vertical stack flows, modules separate by `16px` (`space-md`) or `24px` (`space-lg`).
- **Internal Card Padding:** Default card containers utilize `16px` padding on all sides, escalating to `20px` or `24px` for hero net worth containers.
- **Safe Area Insets:** Top header zones reserve `12px` of ivory canvas above balance cards; the standard iOS bottom tab bar rests above the device home indicator, bordered with a `1px` `#CCD5CC` top hairline.

## Elevation & Depth

This system avoids drop shadows and diffused blurs. Depth is conveyed strictly via tonal layering and structural hairline framing:

1. **Base Layer:** The canvas sits at `#F7F5EF`.
2. **Elevated Panels:** Cards, bottom sheets, and summary containers use pure white `#FFFFFF` defined by a crisp `1px` stroke in `#CCD5CC`. No blur or ambient shadow is cast.
3. **Pills & Scope Chips:** Nested directly inside panels or floating on canvas with a flat `#DDE7DD` fill, creating an inset or stamped appearance.
4. **Modals & Bottom Drawers:** Slide up with pure `#FFFFFF` background, bound by a top border hairline of `#CCD5CC`, with an ivory dimmed backdrop (`rgba(32, 59, 50, 0.25)`).

## Shapes

The geometry is precise, tailored, and deliberately architectural:

- **Financial Panels & Record Cards:** Fixed at `6px` radius. This tight radius maintains the look of a physical receipt or ledger sheet rather than a consumer toy.
- **Action Buttons & Inputs:** Fixed at `8px` radius, providing ergonomic touch targets with subtle visual softening.
- **Scope & Filter Chips:** Full capsule pills (`999px` radius) to cleanly differentiate operational toggles from financial cards.
- **Hairlines:** Crisp `1px` borders (down to `0.5px` on high-DPI displays) utilizing `#CCD5CC`.

## Components

### Hero Balance Display

- Centered or left-aligned on `#F7F5EF` canvas.
- 40px `numeric-hero` text in `#203B32` with tabular numerals.
- Accompanied below by an inline metadata row: a `label-sm` timestamp in `#52665C` ("Updated 12 Nov via CSV") flanked by a dot divider and scope badge.

### Financial Panels & Cards

- Background: `#FFFFFF`. Border: `1px solid #CCD5CC`. Border Radius: `6px`.
- Padding: `16px` or `20px`.
- Content divided internally via `1px` `#CCD5CC` hairline dividers.
- Never use box shadows.

### Buttons & Interactive Controls

- **Primary Button:** Background `#244F42`, text `#FFFFFF` (`body-md`, `fontWeight: 600`), height `48px`, border radius `8px`. Active press scales down slightly (`0.98`) with opacity `0.9`.
- **Secondary Button:** Background `#FFFFFF`, text `#203B32`, border `1px solid #CCD5CC`, height `48px`, border radius `8px`.
- **Tertiary/Ghost:** Text `#52665C`, background transparent.

### Scope & Filter Chips (Capsules)

- Border radius: `999px`. Height: `28px` to `32px`.
- **Default/Unselected:** Background `transparent`, border `1px solid #CCD5CC`, text `#52665C` (`label-sm`).
- **Selected/Active:** Background `#DDE7DD`, border `1px solid transparent`, text `#203B32` (`label-sm`, semi-bold).
- **Household Member Scope:** Tagged with an avatar dot (e.g., Alex `#203B32`, Sam `#52665C`, Shared `#DDE7DD`).

### Goal & Progress Cards

- Inset within white cards.
- Bar track: `#F7F5EF` with `4px` height and `2px` radius.
- Progress fill: `#F0D6BC` (warm apricot accent) for on-track metrics, `#203B32` for fully funded targets.

### Ledger Row Items (Lists)

- Vertical list rhythm with `12px` vertical padding.
- Left slot: Category title (`body-md`, `#203B32`) and subtitle/source row (`body-sm`, `#52665C`).
- Right slot: Tabular monetary figure (`numeric-table`, `#203B32`) stacked over status or scope tag.
- Hairline border bottom `#CCD5CC` inset `16px` from left.

### Bottom Tab Bar

- Background: `#FFFFFF` (or translucent `#FFFFFF` with `95%` opacity).
- Height: `56px` + safe area inset.
- Top border: `1px solid #CCD5CC`.
- 5 Destinations: Home, Activity, Goals, Wealth, More.
- Inactive icon and text: `#52665C`.
- Active icon and text: `#203B32`.
