import type { Type } from "@nestjs/common";
import type { AuthServerEnvironment } from "@joint/contracts";
import type { PrismaClient } from "@joint/database/client";
import { AuthProvider } from "./auth-provider.js";
import { IdentityService } from "./identity.service.js";
import { IdentityVerifier } from "./identity-verifier.js";
import { IdentityVault } from "./identity-vault.js";
import { SessionStore } from "./session-store.js";
import { createIdentityController } from "./identity.controller.js";
import { HouseholdService } from "../households/households.service.js";
import { ScopedDatabase } from "@joint/database/scoped";
import { createAccountsController } from "../accounts/accounts.controller.js";
import { AccountQueries } from "../accounts/account-queries.js";
import { AccountMutations } from "../accounts/account-mutations.js";
import { AccountGrants } from "../accounts/account-grants.js";
import { DataVault } from "@joint/database/data-vault";
import { createImportsController } from "../imports/imports.controller.js";
import { ImportQueries } from "../imports/import-queries.js";
import { ImportPreview } from "../imports/import-preview.js";
import { ImportReview } from "../imports/import-review.js";
import { ImportLifecycle } from "../imports/import-lifecycle.js";
import { createTransactionsController } from "../transactions/transactions.controller.js";
import { TransactionQueries } from "../transactions/transaction-queries.js";
import { TransactionMutations } from "../transactions/transaction-mutations.js";
import { TransactionAnnotations } from "../transactions/transaction-annotations.js";
import { TransactionSplits } from "../transactions/transaction-splits.js";
import { ReportService } from "../reports/report.service.js";
import { CategoriesService } from "../categories/category.service.js";
import { BudgetMutations } from "../budgets/budget-mutations.js";
import { AccountCoverage } from "../accounts/account-coverage.js";
import { createReportsController } from "../reports/reports.controller.js";
import { createBudgetsController } from "../budgets/budgets.controller.js";
import { createCoverageController } from "../accounts/coverage.controller.js";
import { TransfersService } from "../transfers/transfers.service.js";
import { createTransfersController } from "../transfers/transfers.controller.js";
import { EntitlementService } from "../entitlements/entitlement.service.js";
import { createEntitlementsController } from "../entitlements/entitlements.controller.js";
import { ArchiveDatabase } from "@joint/database/archive";
import { ArchiveService } from "../archive/archive.service.js";
import { createArchiveController } from "../archive/archive.controller.js";
import { ExportService } from "../exports/export.service.js";
import {
  createExportsController,
  createArchiveExportsController,
} from "../exports/exports.controller.js";
import { PrivacyJournal } from "@joint/database/privacy-journal";
import { DeletionRepository } from "@joint/database/deletion";
import { PrivacyService } from "../privacy/privacy.service.js";
import { LeaveService } from "../privacy/leave.service.js";
import {
  createLeaveController,
  createPrivacyController,
} from "../privacy/privacy.controller.js";
import { createWealthController } from "../wealth/wealth.controller.js";
import { WealthService } from "../wealth/wealth.service.js";
export interface AuthOptions {
  database: PrismaClient;
  environment: AuthServerEnvironment;
  importKey?: string;
  privacyJournalPath?: string;
}
export function identityControllers(options?: AuthOptions): Type<unknown>[] {
  if (!options)
    return [
      createIdentityController(),
      createAccountsController(),
      createImportsController(),
      createTransactionsController(),
      createReportsController(),
      createWealthController(),
      createBudgetsController(),
      createCoverageController(),
      createTransfersController(),
      createEntitlementsController(),
      createArchiveController(),
      createExportsController(),
      createArchiveExportsController(),
      createPrivacyController(),
      createLeaveController(),
    ];
  const { database, environment: env } = options;
  const provider = new AuthProvider(
    env.SUPABASE_AUTH_URL,
    env.SUPABASE_PUBLISHABLE_KEY,
  );
  const vault = new IdentityVault(env.AUTH_TOKEN_KEY, env.AUTH_EMAIL_HASH_KEY);
  const sessions = new SessionStore(
    database,
    vault,
    new IdentityVerifier(env.AUTH_ISSUER),
    provider,
  );
  const identity = new IdentityService(sessions, provider, database, vault);
  const scoped = new ScopedDatabase(database);
  const reports = new ReportService(scoped);
  const archive = new ArchiveDatabase(database);
  const journal = options.privacyJournalPath
    ? new PrivacyJournal(options.privacyJournalPath)
    : undefined;
  const exports = options.importKey
    ? new ExportService(scoped, archive, new DataVault(options.importKey))
    : undefined;
  return [
    createWealthController({ identity, wealth: new WealthService(scoped) }),
    createPrivacyController({
      identity,
      privacy: new PrivacyService(new DeletionRepository(database), journal),
    }),
    createLeaveController({
      identity,
      leave: new LeaveService(scoped),
      journal,
    }),
    createArchiveController({
      identity,
      archive: new ArchiveService(archive, vault),
    }),
    createExportsController(exports ? { identity, exports } : undefined),
    createArchiveExportsController(exports ? { identity, exports } : undefined),
    createEntitlementsController({
      identity,
      entitlements: new EntitlementService(scoped),
    }),
    createTransfersController({
      identity,
      transfers: new TransfersService(scoped, vault),
    }),
    createReportsController({
      identity,
      reports,
      categories: new CategoriesService(scoped),
    }),
    createBudgetsController({
      identity,
      reports,
      budgets: new BudgetMutations(scoped),
    }),
    createCoverageController({
      identity,
      coverage: new AccountCoverage(scoped),
    }),
    createIdentityController(identity, new HouseholdService(database, vault)),
    createAccountsController({
      identity,
      queries: new AccountQueries(scoped, vault),
      mutations: new AccountMutations(scoped, vault),
      grants: new AccountGrants(scoped),
    }),
    createTransactionsController({
      identity,
      queries: new TransactionQueries(scoped, vault),
      mutations: new TransactionMutations(scoped, vault),
      annotations: new TransactionAnnotations(scoped),
      splits: new TransactionSplits(scoped),
    }),
    createImportsController({
      identity,
      queries: new ImportQueries(scoped, vault),
      preview: new ImportPreview(
        scoped,
        vault,
        options.importKey ? new DataVault(options.importKey) : undefined,
      ),
      review: new ImportReview(scoped),
      lifecycle: new ImportLifecycle(scoped, vault),
    }),
  ];
}
