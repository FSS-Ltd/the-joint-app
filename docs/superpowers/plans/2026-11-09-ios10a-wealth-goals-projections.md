# IOS10a Implementation Plan: Native Wealth, Goals, Contributions and Projections Experience

## Problem Statement

While backend services for goals (3B), allocations and contribution plans (3C), and deterministic projections (IOS8/9) are implemented and verified in PostgreSQL and NestJS API, native mobile (`@joint/mobile`) currently lacks screens for viewing goals, editing funding allocations, updating contribution schedules, and visualizing projected wealth trajectories.

Users need a clear, accessible, mobile-first experience to track long-term savings goals, understand whether goals are reachable by their target dates under realistic market conditions, adjust monthly contributions, and experiment with advanced scenarios.

## Architectural Approach & Key Decisions

1. **Design Craft & Aesthetics (/design-craft):**
   - High-contrast, clean typography leveraging brand tokens (`colors.forest`, `colors.action`, `colors.ivory`, `colors.brass`, `colors.coral`, `colors.border`, `spacing`).
   - Accessible chart alternatives: accessible textual breakdowns and tabular milestone representations alongside visual progress meters, ensuring full screen reader (VoiceOver/TalkBack) readability and dynamic font scaling.
   - State completeness: loading skeletons, empty states ("No goals set yet"), error recovery with retry buttons, and offline resilience.

2. **API Client Layer (`apps/mobile/src/api/goals.ts`):**
   - Contract-driven client consuming `@joint/contracts` schemas.
   - Goals CRUD and pagination.
   - Goal allocations with optimistic/safe locking versions.
   - Contribution plans with dated effective schedules.
   - Basic and advanced projections endpoints from IOS9.

3. **Context Integration (`NativeFinanceProvider`):**
   - Extend `NativeFinanceContextValue` with `goals: GoalsApi`.
   - Wire into `useFinanceResource` with automated lifetime cancellation and 401 recovery.

4. **Features & Components (`apps/mobile/src/features/goals/`):**
   - `GoalsList`: Overview of active and completed goals, aggregate progress, target milestones, and funding shortfalls.
   - `GoalDetail`: Detailed view showing current allocated funding, target progress percentage, contribution schedule, and projected trajectory.
   - `ProjectionMeter`: Visual trajectory progress bar and milestone timeline with accessible text alternatives.
   - `AllocationCard`: Allocation summary showing accounts linked to this goal, flagging any account capacity shortfalls or totals-only restrictions.
   - `ScenarioSimulator`: Interactive scenario simulation with rate provenance and PLUS entitlement gating.

5. **Routes (`apps/mobile/app/(workspace)/goals/`):**
   - Stack navigator with `index` (goals overview) and `[goalId]` (goal detail, allocation, and projections).
   - Linked from `HomeScreen` via native action "Track goals & projections".

## Rollout & Verification Plan

1. Verify TypeScript types and contracts bindings.
2. Unit tests covering UI rendering, accessibility labels, empty states, and projection milestone formatting.
3. Bundle checks (`bundle:ios` and `bundle:android`).
4. Code and AppSec reviews.
