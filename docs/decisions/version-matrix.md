# Version and licence baseline

Checked 23 October 2026. Installed versions were compared with package manifests after a successful frozen-lockfile install. No dependency upgrades are part of Task 0.4. pnpm-lock.yaml remains the executable dependency authority. Package metadata licences do not grant an open-source licence to this repository.

Runtime: Node 22.23.3; pnpm 10.6.5; local/CI PostgreSQL 17.6; macOS and Linux CI. Native package engines below accept Node 22.23.3, but end-to-end candidate compatibility must still be tested when installed.

## Installed direct dependencies

| Package          | Dependency               | Exact version | Licence metadata |
| ---------------- | ------------------------ | ------------- | ---------------- |
| the-joint-app    | @eslint/js               | 10.0.1        | MIT              |
| the-joint-app    | @playwright/test         | 1.58.2        | Apache-2.0       |
| the-joint-app    | @types/node              | 22.19.15      | MIT              |
| the-joint-app    | eslint                   | 10.13.0       | MIT              |
| the-joint-app    | prettier                 | 3.9.10        | MIT              |
| the-joint-app    | tsx                      | 4.21.0        | MIT              |
| the-joint-app    | turbo                    | 2.11.10       | MIT              |
| the-joint-app    | typescript               | 6.0.3         | Apache-2.0       |
| the-joint-app    | typescript-eslint        | 8.72.0        | MIT              |
| the-joint-app    | vitest                   | 5.0.5         | MIT              |
| @joint/web       | next                     | 16.4.2        | MIT              |
| @joint/web       | react                    | 19.3.1        | MIT              |
| @joint/web       | react-dom                | 19.3.1        | MIT              |
| @joint/web       | @types/react             | 19.2.14       | MIT              |
| @joint/web       | @types/react-dom         | 19.2.3        | MIT              |
| @joint/api       | @nestjs/core             | 12.2.0        | MIT              |
| @joint/api       | @nestjs/common           | 12.2.0        | MIT              |
| @joint/api       | @nestjs/platform-express | 12.2.0        | MIT              |
| @joint/api       | reflect-metadata         | 0.2.2         | Apache-2.0       |
| @joint/api       | rxjs                     | 7.8.2         | Apache-2.0       |
| @joint/database  | pg                       | 8.23.1        | MIT              |
| @joint/database  | @types/pg                | 8.16.0        | MIT              |
| @joint/contracts | zod                      | 4.6.7         | MIT              |

## Proposed additions, not installed

| Component                                  | Proposed exact pin                                                      | Licence metadata                           | Evidence / use gate                                                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prisma, @prisma/client, @prisma/adapter-pg | 7.10.1 each                                                             | Apache-2.0                                 | npm metadata checked; Node 22.23.3 satisfies engines. Task 1.1 must verify TypeScript 6, generator, ESM, explicit seed/migrate configuration and pg adapter together. |
| @supabase/supabase-js                      | 2.118.0                                                                 | MIT                                        | Registry requires Node >=22.0.0; identity integration and session behaviour remain Task 1.2 checks.                                                                   |
| @supabase/ssr                              | 0.12.7                                                                  | MIT                                        | Registry peers include supabase-js ^2.114.0. Server-only cookie/refresh policy must be verified rather than copying browser-assisted defaults.                        |
| Expo                                       | 58.0.17                                                                 | MIT                                        | Candidate for later mobile implementation, not a new app in this step.                                                                                                |
| React Native                               | 0.88.0                                                                  | MIT                                        | Expo SDK 58 targets RN 0.88 and React 19.3.0; isolate mobile React from web React 19.3.1 and run Expo dependency/device checks when installed.                        |
| Mobile React                               | 19.3.0                                                                  | MIT                                        | Expo documented compatibility target; native builds not attempted.                                                                                                    |
| Ollama                                     | 0.40.8                                                                  | MIT                                        | Installed local runtime, synthetic smoke measured; no companion or operational deployment yet.                                                                        |
| Gemma GGUF candidate                       | digest c6eb396dbd5992bbe3f5cdb947e8bbc0ee413d7c17e2beaae69f5d569cf982eb | Apache-2.0 model card / installed manifest | Local metadata: 8.0B, Q4_K_M. A mutable tag is not a release pin; require digest match before use. Exact E4B/E2B lineage review remains open.                         |

The candidate pins are a researched baseline, not a tested native/auth/ORM installation. Revalidate before each implementing step, change through a focused PR if required, and never let a `latest` tag drive a build or release. Supabase hosted database engine/version and plan configuration are not observed because no project was provisioned. Local PostgreSQL is a test baseline, not proof of a cloud runtime match.

## Primary references

- [Prisma 7 migration requirements](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7).
- [Prisma PostgreSQL adapter](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/introduction).
- [Supabase server-side auth](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
- [Expo SDK 58 matrix](https://docs.expo.dev/versions/v58.0.0/).
- [Ollama licence](https://github.com/ollama/ollama/blob/main/LICENSE) and [runtime controls](https://docs.ollama.com/faq).
- [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4).

Exact candidate engine/peer/licence metadata was read with npm view at the stated versions. Retain third-party notices when distributing dependencies/models; no model is redistributed here.

## Task 1.1 installed additions

Prisma, @prisma/client and @prisma/adapter-pg are installed at 7.10.1 (Apache-2.0), verified with strict TypeScript 6/Node ESM, generated client, additive local migrations and PostgreSQL integration tests. jose 6.2.13 (MIT) supplies maintained asymmetric JWT/JWKS verification; the same exact version is a test dependency for ephemeral synthetic signatures. No hand-written cryptography or production test issuer is included. The Supabase SDK installation is recorded below; native candidates remain uninstalled.

## Task 1.2 installed local identity additions

`@supabase/supabase-js` 2.118.0 (MIT) is installed only in the API for its maintained Auth client. `@supabase/ssr` is not installed: browser-assisted token storage does not satisfy this project's server-owned session policy. The client uses explicit refresh ownership and no browser persistence. The lockfile records exact transitive dependencies.

Local identity infrastructure pins `supabase/gotrue:v2.197.0` (MIT), `postgres:17.6` (PostgreSQL licence), `nginx:1.30.6-alpine-slim` (BSD-2-Clause upstream) and `axllent/mailpit:v1.32.0` (MIT). Image contents have their own third-party notices; these upstream licences do not license the repository. Auth owns its vendor schema in a separate database. Prisma remains the sole application schema migration history. No hosted resources or production region/backup settings were created or verified.

## Task 1.3 workspace addition

`@joint/domain` is a private workspace package containing exact GBP parse/format and liability-kind helpers. It adds no external dependency; its only dependency is `@joint/contracts`. API and web reuse the same bounded integer Money contract. Existing external pins and licences remain unchanged.
