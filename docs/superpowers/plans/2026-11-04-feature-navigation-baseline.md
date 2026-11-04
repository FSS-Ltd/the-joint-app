# NAV1 — Source-backed feature navigation baseline

Date: 4 November 2026. Base: PR39 merge `5e5a63b1aec322fa06f47b31cbf01ca371c37b50`.

## Scope and acceptance

The founder requires Graphify and a persistent feature tree before every coding
task, including resumed projects. No equivalent project-wide feature tree exists
in the verified base. Backfill the current repository before IOS3 implementation.
This is one standalone documentation delivery unit; it adds no product behavior.

- Create a root `FEATURE_TREE.md` index and focused domain documents covering
  existing surfaces, shared capabilities, infrastructure and planned scope.
- Give each feature a stable ID, purpose, honest implementation status, entry
  points, canonical symbols, directed dependencies/consumers, permission boundary
  and source/test references. Distinguish native gaps from working API/web paths.
- Use installed Graphify on safe tracked-source scopes below its corpus limits.
  Keep generated graphs local and persist a project-wide coverage index. Exclude
  credentials, private runtime evidence, dependencies and generated artifacts.
- Link the inventory from `AGENTS.md`; document graph navigation, refresh and
  missing coverage. Verify source paths, symbols, feature IDs and local graph JSON.
- Independently review code/document quality and security before PR publication.
  Run applicable formatting and repository checks, then deliver NAV1 through its
  own current-revision CI and actual merge before IOS3.

## Work and ownership

1. Parent coordinates Graphify extraction and writes the root index, map guidance,
   progress evidence and final integrated tree. Read-only inventory specialists
   inspect identity/native, financial features and platform/privacy boundaries.
   They report source evidence without product changes or private-data access.
2. Parent reconciles directed edges and reuse points across the reports, checks
   every linked source, and verifies graph scope/freshness. Missing relationships
   remain explicitly unknown rather than inferred as fact.
3. Fresh Code Reviewer and Application Security Engineer inspect the final diff.
   Fix findings, verify locally, raise the PR, require current successful CI and
   verify authorized protected merge. Record host evidence in `docs/progress.md`.

## Preflight rulings

| Boundary                               | Evidence and ruling                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NAV1 versus IOS3                       | The new policy creates a required navigation baseline. Deliver NAV1 separately; no native API implementation belongs here.                                    |
| Existing graph versus project coverage | The earlier local graph covers identity/events only. Extract bounded runtime scopes and explicitly document tests, SQL/models and semantic coverage gaps.     |
| Inventory versus implementation        | Source and tests establish behavior. Future plan checkboxes, graph links and route names do not prove completion.                                             |
| Private evidence versus navigation     | Read tracked public source only. Retain the existing acceptance checkouts and durable private fixture without accessing their secrets or restarting services. |
| Shared files                           | Parent owns index/guidance/progress. Specialists write separate ignored reports, avoiding conflicting edits.                                                  |

## Predecessor evidence

[PR39](https://github.com/FSS-Ltd/the-joint-app/pull/39) is host-confirmed merged
into `main` at the base revision. PR CI41777899568 passed Foundation checks and
Native bundle checks. Post-merge [CI41779002327](https://github.com/FSS-Ltd/the-joint-app/actions/runs/41779002327)
completed successfully on the exact merge: Foundation126405968258 and
Native126405967941 both succeeded. Both checkout logs identify the merge SHA.
The existing standing merge authorization and repository protections remain.
