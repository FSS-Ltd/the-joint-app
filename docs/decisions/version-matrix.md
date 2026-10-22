# Version matrix

Verified during B0. Exact direct dependencies below; pnpm-lock.yaml pins transitives.

Node: 22.23.3. pnpm: 10.6.5. PostgreSQL: 17.6.

| Package          | Dependency               | Version  |
| ---------------- | ------------------------ | -------- |
| the-joint-app    | @eslint/js               | 10.0.1   |
| the-joint-app    | @playwright/test         | 1.58.2   |
| the-joint-app    | @types/node              | 22.19.15 |
| the-joint-app    | eslint                   | 10.13.0  |
| the-joint-app    | prettier                 | 3.9.10   |
| the-joint-app    | tsx                      | 4.21.0   |
| the-joint-app    | turbo                    | 2.11.10  |
| the-joint-app    | typescript               | 6.0.3    |
| the-joint-app    | typescript-eslint        | 8.72.0   |
| the-joint-app    | vitest                   | 5.0.5    |
| @joint/web       | next                     | 16.4.2   |
| @joint/web       | react                    | 19.3.1   |
| @joint/web       | react-dom                | 19.3.1   |
| @joint/web       | @types/react             | 19.2.14  |
| @joint/web       | @types/react-dom         | 19.2.3   |
| @joint/api       | @nestjs/core             | 12.2.0   |
| @joint/api       | @nestjs/common           | 12.2.0   |
| @joint/api       | @nestjs/platform-express | 12.2.0   |
| @joint/api       | reflect-metadata         | 0.2.2    |
| @joint/api       | rxjs                     | 7.8.2    |
| @joint/database  | pg                       | 8.23.1   |
| @joint/database  | @types/pg                | 8.16.0   |
| @joint/contracts | zod                      | 4.6.7    |

Supabase, Prisma, Expo, Ollama and model digests are deferred to their implementation gates; no deployment or compatibility claim is made for them.
