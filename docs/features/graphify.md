# Graphify navigation and maintenance

Start with the [canonical feature tree](../../FEATURE_TREE.md). Feature IDs and
directed dependency links describe intended reuse points. Graphify helps locate
symbols and nearby code; verify its results against source and tests before
deciding where to change behavior.

## Current local graphs

The NAV1 baseline was extracted with the installed `graphify` skill from tracked
runtime source at PR39 merge `5e5a63b1aec322fa06f47b31cbf01ca371c37b50`.
IOS3 refreshed the affected API, shared and web-component scopes at runtime revision `58a8b81ec6d93f7befd23bb9ba9252503ec8a9ef`; unchanged scopes were reconciled through complete source hashes. The shared scope now includes the canonical status decoder. The mobile scope was then rebuilt at `2922503e636174dc04b14e4589f7cd1daa67a64f` for the common transport and platform send bindings; all other selected runtime hashes were verified unchanged. Task 3 rebuilt mobile again at `325b3f572ab320742b2dda5f6259ac68ea37f9f5` for stream/scope/resource code; other runtime hashes were verified unchanged. Per-scope extraction revisions remain explicit. IOS3 PR41 merged at `874e15260eff07bb8e56548269c3efefc82a6252`; the IOS4 entry checkout has the same reviewed tree, and its selected runtime hashes remain unchanged from extraction. IOS4 Task1 then rebuilt API, mobile and shared at `9ed898bb99316f45674284e348e47a6b2a48e508` for wealth observations/expiry and native adapters. Unchanged scopes were source-hash verified; the six scopes selected 495 runtime files and detected 491 after four sensitive-file exclusions. Task1 fix `f3b5bad0e598dd5381843b23765e5deae3e295a5` then rebuilt API for the shared production clock query used by DST tests; coverage at that boundary was 496 selected and 492 detected files, with the same four exclusions. Task2 then rebuilt mobile at `0c6447c4caa02a7c20d432dc2213cf8b8a12ca2d` for finance hooks/provider and the verified identity bridge. Fix `7c5e3d8cb9b134513fa50580acc1e8fd828d9fe0` rebuilt mobile again for runtime-owned recovery memory and its consumers. Task3 then rebuilt mobile at `1d897d461fcc82ccec2a2b50dff50c2aa090d644` for actual navigation, read screens and shared panels/list shell. Fix `7b0658230c100d2e68427c93dcc6c20d9e31b21a` rebuilt mobile again for stable ready publication and selected tab composition. Task4 phase1 `522a87c` then rebuilt mobile for account write screens, draft/intent helpers and rendered resource capture guards. Fix03a690e rebuilt mobile again for synchronous current-idle mutation admission; its 115 detected files retain 311 nodes and 341 edges. Fix48252ba rebuilt mobile for rejected-input recovery and shared for the canonical portable GBP helper. Shared now has70 detected files/211 nodes/310 edges; mobile remains115 files/311 nodes/341 edges. Current coverage is551 selected and547 detected files; unchanged scopes are source-hash verified. Both independent fix2 reviews approve product source. Fix3 binds physical package-directory roots and rejects metadata aliases; both independent scoped reviews approve this exact tooling. Actual native re-test remains pending.
The local project-wide index is `.local/graphify/project/index.json`. It records
the source revision, selected file paths, excluded-file counts and graph paths.
Generated outputs are intentionally ignored and contain no private runtime data.
A fresh checkout must rebuild missing graphs before using them; checked-in
feature documents remain available as the portable inventory.

| Scope            | Source coverage                                         | Detected files | Graph JSON, relative to project root                             |
| ---------------- | ------------------------------------------------------- | -------------: | ---------------------------------------------------------------- |
| `api`            | `apps/api/src/`                                         |            122 | `.local/graphify/project/api/graphify-out/graph.json`            |
| `mobile`         | `apps/mobile/src/`, `apps/mobile/app/`                  |            115 | `.local/graphify/project/mobile/graphify-out/graph.json`         |
| `web-routes`     | `apps/web/app/`                                         |             80 | `.local/graphify/project/web-routes/graphify-out/graph.json`     |
| `web-components` | `apps/web/components/`, `apps/web/lib/`                 |            122 | `.local/graphify/project/web-components/graphify-out/graph.json` |
| `shared`         | Runtime source in `packages/`, plus `apps/web/proxy.ts` |             70 | `.local/graphify/project/shared/graphify-out/graph.json`         |
| `operations`     | `apps/worker/src/`, `scripts/`                          |             38 | `.local/graphify/project/operations/graphify-out/graph.json`     |

Each scope also has `graph.html`, `GRAPH_REPORT.md` and a source manifest beside
its graph JSON. These six scopes are deterministic AST extractions: no semantic
model tokens were used. The earlier identity/events graph was a smaller scoped
map, not a historical whole-project inventory. NAV1 does not certify past chats.

The source-backed feature inventory also produces
`.local/graphify/project/features/graphify-out/graph.json`: the current stable feature IDs,
their declared dependencies and canonical source references. Its node IDs are
`feature_AUTH`, `feature_ACCOUNTS` and so on. The feature graph JSON preserves directed edges. Its matching relationship index is
`.local/graphify/project/feature-dependencies.json`; use it or the tracked tree
for direction because the HTML does not display directional arrows. The feature graph
manifest hashes the current domain documents, while the project index hashes
both runtime source and feature documents. Inventory-agent token usage was not
measured; it is not reported as zero semantic cost.

IOS5 step 3a rebuilt the mobile scope from a fresh worktree snapshot (131 files including routes, 347 nodes, 376 edges at 3a; 366 nodes, 398 edges after 3b; 391 nodes, 425 edges after 3c; 398 nodes, 431 edges after 4a; see the progress record for 4b) because the earlier `.local` graphs were not present in this checkout; other scopes were not rebuilt here and are not claimed current for this revision.

## Native acceptance helper scope

IOS4 also has a separate task-local authored-helper graph at
`.local/graphify/project/native-acceptance/graphify-out/graph.json`.
It maps 44 explicitly allowlisted code files from frozen fix3 manifest
`89ba65071fbbcdfd6e720cff9e82b5720ec9fb4ca6567866f3f3341470e8e51b`,
bound to production source `48252ba`. Its 142 nodes and 255 edges locate seed,
paging, metrics, heartbeat, process, dependency-resolution and simulator/recheck helpers. The project index's
`native_acceptance_tooling` entry records its exact source hashes separately;
these files do not inflate the 551 selected runtime-source count.

This scope was added at the current IOS4 coverage boundary, not retroactively
claimed for earlier work. Extraction copies only the frozen authored code into
a visible snapshot because Graphify skips hidden task directories, then restores
the original repository-relative source references. Sensitive-file detection
remains enabled; this extraction excluded zero files. No dependency tree,
credentials, client data, run receipts, logs or private runtime evidence is
copied into this graph. Structural extraction uses zero model tokens.

The helper graph is local navigation, not proof of execution or server parity.
Its source is retained in this task's ignored authored-source workspace; a fresh
checkout cannot reconstruct it without those exact public helper artifacts.
Continue using the tracked feature tree and six runtime scopes for portable
product navigation. Refresh this optional scope from the next exact frozen
authored-source manifest whenever those helpers change; validate its manifest,
file hashes, source paths and graph endpoints before use.

The first df6 native execution manifest omitted import-only workspace packages because its dependency resolver used CommonJS export resolution. The helper graph still binds its40 explicitly listed authored files; it does not prove complete runtime dependency coverage. The actual served source map identifies the exercised formatter. Required import-only package/source/build resolution is being corrected before re-test; preserve the historical manifest and evidence rather than claim it was complete.

## Query before deciding

Run from the repository root, choosing the feature's scope and canonical symbol:

```sh
graphify query "identity subscription" --graph .local/graphify/project/api/graphify-out/graph.json --budget 1500
graphify explain "NativeIdentityController" --graph .local/graphify/project/mobile/graphify-out/graph.json
graphify query "allocation contribution" --graph .local/graphify/project/shared/graphify-out/graph.json --budget 1500
graphify explain "ACCOUNTS" --graph .local/graphify/project/features/graphify-out/graph.json
graphify query "paging metrics heartbeat" --graph .local/graphify/project/native-acceptance/graphify-out/graph.json --budget 1500
```

Follow `source_file` and `source_location` into the checked-out implementation and
its feature-tree test references. Search the tree, graph and repository under
alternate names before adding a component, hook, endpoint, service or schema.
Reuse the canonical implementation unless the feature entry records a concrete
reason to introduce a separate one. Do not infer that a planned screen exists
from its contract types or a future implementation-plan paragraph.

## Refresh at task boundaries

1. Invoke the installed Graphify skill. Check the existing index and feature tree
   against the current checkout. Keep a source revision and per-file content
   hashes in local extraction metadata; a graph from a different source revision
   needs reconciliation before it can guide implementation.
2. Extract only a safe tracked-source snapshot. Exclude `.env*`, credentials,
   private evidence, generated native projects, build output, dependencies,
   caches and graph outputs. Do not run a broad scan of ignored acceptance data.
3. Follow the skill's incremental workflow for changed files. For deletion,
   rename or ambiguous stale edges, rebuild the affected bounded scope instead
   of blindly merging old nodes. Check each scope's corpus limit before extraction;
   narrow a scope that exceeds the skill's limit rather than bypassing it.
4. Update affected feature entries and reciprocal dependency/consumer links in the
   same task. Extend the source-backed inventory when discovering an unmapped
   capability. Regenerate the local index, graph JSON, report and visualization.
5. Verify mapped paths, stable feature anchors, named symbols, graph schema,
   source hashes and affected consumers. Record what was queried, reused and
   refreshed in the task's progress/handoff, including any blocked coverage.

Use explicit task-boundary updates. This policy does not install watchers, Git
hooks, paid services, external uploads or recurring polling.

## Rebuild missing local maps

The local inventory JSON and one-off extraction scripts are ignored working
artifacts, not prerequisites shipped with a fresh checkout. Reconstruct them from
the tracked tree and installed skill as follows:

1. Enumerate tracked runtime code with `git ls-files` under the six scopes above.
   For `shared`, select package `src/` code, `packages/database/prisma.config.ts`, `packages/database/prisma/seed.ts` and `apps/web/proxy.ts`. Preserve
   repository-relative paths in a separate ignored snapshot for each scope;
   apply the exclusions and sensitive-file detector before extraction. Check
   corpus limits on each snapshot, then follow the skill's code-only AST,
   clustering and export steps. Keep excluded-file counts, selected source paths
   and SHA-256 content hashes; never replace exclusions with a broader scan.
2. Read the four domain documents linked by `FEATURE_TREE.md`. For every explicit
   feature anchor, retain its stable ID, name, status, entry points, canonical
   implementation and `Depends on / reuses` links. Verify `Used by` is reciprocal;
   resolve discrepancies against cited source rather than inventing an edge.
3. Create a document node `feature_<ID>` per feature, with `source_file` set to its
   domain document, `source_location` set to `#<lowercase-id>` and the declared
   status. For each entry-point or canonical reference, create one source node
   named `source_` plus the first 16 hexadecimal SHA-256 characters of
   `<repository-relative-path>|<symbol>`. Preserve its source path and the first
   matching symbol line when present; Markdown references are document nodes,
   other references are code nodes. Tests remain linked evidence, not AST nodes.
4. Add directed `depends_on` edges from each feature to its declared dependencies.
   Add feature-to-source `specified_by` edges for planned features and
   `implemented_by` edges otherwise; a partial feature's edges describe only its
   documented foundation. Mark these document-extracted relationships
   `EXTRACTED`, with confidence score `1.0` and the domain path/feature anchor.
   Deduplicate source nodes by path/symbol and edges by source/target/relation.
5. Cluster an undirected projection with Graphify's `build_from_json` and
   `cluster`, but export the feature graph from a NetworkX `DiGraph` so opposite
   dependencies survive. Use Graphify's `to_json`, `to_html` and report generation
   for the feature output path above. Write `feature-dependencies.json` as the
   ID-to-dependency-list index. Hash the four domain documents in the feature
   manifest; add `FEATURE_TREE.md`, `AGENTS.md` and this guide to the project
   index's feature-document hashes.
6. Write `index.json` with the actual source revision, checked checkout revision,
   runtime-change assessment and each scope's relative graph path, selected files,
   detected/excluded counts, node/edge counts and source hashes. Validate paths,
   anchors, source symbols, graph endpoints, reciprocal dependencies and all
   hashes before querying. Record unknown semantic token cost explicitly.

## Known coverage and tooling limits

- Tests, SQL migrations, Prisma models, most configuration, design images and
  most product documents are linked from the feature tree but are not AST-extracted
  into these runtime graphs. The shared scope explicitly includes the database
  Prisma configuration and seed entry points. Their implementation/permission evidence must be
  read directly. Native acceptance evidence is not copied into the graph.
- Graphify's sensitive-file detector excluded four tracked runtime files across
  the six scopes. Do not disable it to obtain a larger count. Source verification
  remains necessary for affected boundaries.
- AST extraction can collapse repeated symbol names and represents inferred call
  relationships in an undirected graph. A handler label such as `GET` is not a
  unique route, and edge presentation does not prove call direction. Use source
  paths and verified feature-ID dependencies; never invent a missing relationship.
- A source-backed feature inventory is not exhaustive line-by-line verification.
  Individual route aliases, each migration policy and every fixture edge are not
  separately enumerated. Unknown coverage stays explicit as the tree expands.
- Graphify's token benchmark estimates navigation output versus loading the
  corpus. It is not a measured saving in this chat. Semantic extraction, where
  used separately, must disclose unavailable token measurement rather than claim
  zero cost.
