# FSS agent rule set

Version: 3.0 | Updated: 2026-10-05 | Owner: Jean-Fidele Ntagengwa

This folder is the maintained source of reusable FSS rules. Files here do not
automatically configure other repositories or either agent's global settings.

## Files and responsibilities

| File                                   | Purpose                                                         | Read when                              |
| -------------------------------------- | --------------------------------------------------------------- | -------------------------------------- |
| [AGENTS.md](AGENTS.md)                 | Shared policy, authority, quality and mandatory delivery gate   | Agent entry point                      |
| [CLAUDE.md](CLAUDE.md)                 | Claude entry point importing the shared policy                  | Claude starts in the installed project |
| [BUILD.md](BUILD.md)                   | Implementation, verification, PR delivery and release procedure | Doing engineering work                 |
| [STRATEGY.md](STRATEGY.md)             | Discovery, proposals, business analysis and FSS voice           | Doing strategic/commercial work        |
| [RULES_RESEARCH.md](RULES_RESEARCH.md) | Dated official evidence and update rationale                    | Maintaining or auditing rules          |

AGENTS.md is the shared policy source. Keep the full build-step gate there;
BUILD.md explains its execution. Keep commercial/voice details in STRATEGY.md.
The index and research note explain the setup without restating every rule.

## Install in a project

1. Inspect existing repository instructions, package scripts, CI, plans and
   branch policy. Merge these reusable rules with the project-specific guidance;
   do not overwrite existing instructions or discard local exceptions blindly.
2. Put the shared AGENTS.md and the CLAUDE.md adapter at the repository root.
   Keep the referenced BUILD.md and STRATEGY.md beside them, or adjust links and
   explicit read instructions to their actual repository-relative locations.
3. Add a short repository-specific section with actual setup/run/check commands,
   important directory purposes, generated-file rules, sensitive boundaries and
   the delivery base branch. Verify commands against the repository itself.
4. Place genuinely local rules near the code they govern. Keep them focused on
   that component's exceptions and commands, without weakening the shared gate.
5. Inspect required host protections and CI coverage. Configure changes when
   authorized, following BUILD.md. Text instructions alone do not enforce merges.
6. Start a fresh agent session in the target repository and verify the active
   instructions and predecessor gate before continuing a build.

For a central manual used outside repositories, explicitly attach/reference the
relevant files. Do not assume the agent discovers this folder from another cwd.
files.zip contains the updated design and discovery templates, not agent entry
points. Use its templates when useful; install the rules from the Markdown files.
Extract templates beside these rules, or adjust their relative links when
copying them into a project's documentation directory.

## How Codex loads rules

Codex loads global guidance from its configured home, then project guidance from
the root down to the working directory. At each level it prefers a non-empty
AGENTS.override.md, then AGENTS.md, then configured fallback names. Later,
more-local instructions take precedence. Without a project root, it checks the
current directory. Combined automatic project guidance defaults to a 32 KiB
limit. [Official Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

BUILD.md and STRATEGY.md are ordinary references, not automatically discovered
instruction filenames. AGENTS.md explicitly routes relevant tasks to them;
Codex does not use Claude's `@file` import syntax for this setup. Keep any global
file smaller than this project policy so it does not crowd out local guidance.

Ask a fresh session to identify loaded instruction sources and summarize the
mandatory predecessor gate. Repeat from a specialized subdirectory to check
local scope. Inspect any active overrides if the result is unexpected. Do not
increase the byte limit merely to preserve unnecessary repeated instructions.

## How Claude Code loads rules

Claude Code loads project CLAUDE.md instructions and supports imports using
`@path`. The adapter imports `@AGENTS.md`, so shared standards have one source.
Imports load their content into context; importing every guide at startup would
not save context. [Official Claude Code memory documentation](https://code.claude.com/docs/en/memory)

Current Claude Code also supports AGENTS.md directly, but default loading can
be suppressed by a CLAUDE.md/CLAUDE.local.md in the working directory or its
ancestors. Keep the explicit import for predictable compatibility. Nested
CLAUDE.md files and `.claude/rules/*.md` with `paths` frontmatter can hold
component-specific instructions. Keep a cross-agent equivalent for essential
rules; Codex does not automatically load `.claude/rules`.

Use Claude's `/context` to inspect loaded instructions. When importing files
outside the project, follow Claude's import approval behavior. Keeping the
adapter and shared file together avoids host-specific absolute import paths.
Auto memory is supplementary personal context; it is not the team's policy or
the source of truth for PR/CI/merge status.

## Validate adoption

Test the rules against concrete situations:

- Step 1.1 has local tests passing but no PR: raise its PR; do not start 1.2.
- Its PR is open with green CI: obtain an authorized merge; do not start 1.2.
- Auto-merge is enabled or queued: wait for verified merge; do not start 1.2.
- A new commit was pushed after green CI: verify checks for the new revision.
- CI is absent, failed or unavailable: report the blocker and remain on 1.1.
- 1.1 is confirmed merged with passing required CI: refresh the base, record
  evidence, and begin 1.2 only if that work is authorized.
- A bug or documentation typo is unrelated to a build plan: use proportionate
  investigation and checks; avoid loading the whole strategic manual.
- A model or delegated agent changes: the same current-step boundary applies.

These are behavioral acceptance scenarios, not a claim that a prompt guarantees
compliance. Use real repository checks and host settings for enforceable policy.

## Maintain the rules

- Update the version/date when changing policy and explain material changes.
- Review after repeated agent mistakes, loader changes or changed project policy;
  remove duplication and stale rules. Review next by 2027-01-05.
- Keep live progress, branch names, budgets and environment state in project
  records, not reusable startup instructions. Preserve approved commercial terms.
- Add reusable skills for a repeated specialized workflow when beneficial;
  do not turn the entry point into a catalogue of mandatory skills.
- Verify links, import targets, applicability, conflicts and realistic scenarios
  before distributing updates. Keep backups separate from active entry points.

See RULES_RESEARCH.md for the checked official guidance and first-party examples.
