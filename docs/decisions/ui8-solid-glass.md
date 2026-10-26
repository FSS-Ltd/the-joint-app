# UI8 — Solid-feeling glass

The user requested a refinement of the approved baseline: remove the appearance of cards inside cards and make glass barely transparent. This replaces the earlier opaque-card/translucent-frame treatment; the layouts, forest/ivory palette, rectangular shapes and working flows remain approved.

Use one near-opaque white glass surface per content panel, with a fine border, restrained shadow and subtle inset highlight. Remove decorative borders, backgrounds and eight-pixel insets from layout-only wrappers across identity, accounts, activity, imports, spending and privacy. Keep meaningful grouping, row separators, selected controls and labelled feedback. Desktop retains its ivory workspace, using one near-opaque surface instead of an eight-pixel frame. Mobile retains the forest backdrop and capsule navigation.

Use existing CSS and dependencies. With backdrop filtering available, white panels use 96% white (the amount summary uses 96% forest) and the desktop canvas uses 97% ivory with a 16px blur. Unsupported browsers and reduced-transparency preferences receive solid surfaces. No new motion, financial computation, API, schema, authentication, permission or event behaviour changes.

Acceptance: inspect synthetic production renders at 390/1280px against both private references; check 320px overflow, 200% zoom, keyboard focus, meaningful error/empty/populated states and navigation. Verify contrast against the darkest and lightest possible composite backgrounds. Reuse existing behavioural suites rather than add tests mirroring CSS declarations. Review all changed files and deliver through the normal PR/current-CI/verified-merge gate. No deployment or private-reference redistribution.
