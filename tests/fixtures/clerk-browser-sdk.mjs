// Browser-only SDK facade served by Playwright interception, never by the app.
// Real @clerk/nextjs React hooks render the production components against these
// deterministic resources. No credentials, real user, email or provider calls.
const scenario =
  globalThis.sessionStorage.getItem("clerkSyntheticScenario") ?? "signup";
const signalListeners = new Set();
const resourceListeners = new Set();
const event = async (action) => {
  await globalThis.fetch(`/__synthetic_clerk/${action}`, { method: "POST" });
};
const result = () => ({ error: null });
const fail = (code) => ({
  error: { code, message: "PRIVATE_PROVIDER_SENTINEL" },
});
const verify = (code) =>
  code === "000000"
    ? fail("form_code_incorrect")
    : code === "999999"
      ? fail("verification_expired")
      : result();
const stage = globalThis.sessionStorage.getItem("clerkSyntheticStage");
let signedIn =
  stage === "complete" ||
  (!globalThis.sessionStorage.getItem("syntheticSignedOut") &&
    ["cleanup-failure", "logout", "existing"].includes(scenario));
const session = {
  id: "sess_syntheticBrowser",
  status: "active",
  currentTask: globalThis.sessionStorage.getItem("syntheticTaskDone")
    ? null
    : scenario === "google-task"
      ? { key: "setup-mfa" }
      : scenario === "password-task"
        ? { key: "reset-password" }
        : null,
  getToken: async () => "synthetic.browser.token",
};
let user = {
  id: "user_syntheticBrowser",
  totpEnabled: true,
  twoFactorEnabled: true,
  backupCodeEnabled: true,
  async disableTOTP() {
    user = { ...user, totpEnabled: false, twoFactorEnabled: false };
    await event("totp-disable");
    return user;
  },
  async createTOTP() {
    await event("totp-create");
    return {
      secret: "JBSWY3DPEHPK3PXP",
      uri: "otpauth://totp/Synthetic?secret=JBSWY3DPEHPK3PXP&issuer=Synthetic",
    };
  },
  async verifyTOTP({ code }) {
    const value = verify(code);
    if (value.error) throw value.error;
    user = { ...user, totpEnabled: true, twoFactorEnabled: true };
    await event("totp-enroll-verify");
    return user;
  },
  async createBackupCode() {
    await event("backup-codes-create");
    return { codes: ["synthetic-backup-code"] };
  },
  async reload() {
    user = { ...user };
    lastResources = resources();
    for (const listener of resourceListeners) listener(lastResources);
    return user;
  },
};
const signIn = {
  id: stage === "google-mfa" ? "si_synthetic" : undefined,
  status: stage === "google-mfa" ? "needs_second_factor" : "needs_first_factor",
  supportedSecondFactors: [{ strategy: "totp" }, { strategy: "backup_code" }],
  supportedFirstFactors: [{ strategy: "password" }],
  async create() {
    this.id = "si_synthetic";
    await event("sign-in-create");
    return result();
  },
  async password() {
    this.id = "si_synthetic";
    this.status =
      scenario === "device" ? "needs_client_trust" : "needs_second_factor";
    this.supportedSecondFactors =
      scenario === "device"
        ? [{ strategy: "email_code" }]
        : [{ strategy: "totp" }, { strategy: "backup_code" }];
    await event("password-sign-in");
    return result();
  },
  async reset() {
    this.id = undefined;
    this.status = "needs_first_factor";
    return result();
  },
  async sso(settings) {
    await event("google-start");
    globalThis.sessionStorage.setItem(
      "clerkSyntheticStage",
      scenario === "google-task" || scenario === "password-task"
        ? "complete"
        : "google-mfa",
    );
    globalThis.location.assign(settings.redirectCallbackUrl);
    return result();
  },
  async finalize({ navigate }) {
    await event("sign-in-finalize");
    complete();
    await navigate({ session, decorateUrl: (value) => value });
    return result();
  },
  mfa: {
    async sendEmailCode() {
      await event("device-email-send");
      return result();
    },
    async verifyEmailCode({ code }) {
      const value = verify(code);
      if (!value.error) signIn.status = "complete";
      await event("device-email-verify");
      return value;
    },
    async verifyTOTP({ code }) {
      const value = verify(code);
      if (!value.error) signIn.status = "complete";
      await event("totp-verify");
      return value;
    },
    async verifyBackupCode({ code }) {
      if (code !== "synthetic-backup-code") return fail("form_code_incorrect");
      signIn.status = "complete";
      await event("backup-code-verify");
      return result();
    },
  },
  resetPasswordEmailCode: {
    async sendCode() {
      await event("recovery-send");
      return result();
    },
    async verifyCode({ code }) {
      const value = verify(code);
      if (!value.error) signIn.status = "needs_new_password";
      await event("recovery-verify");
      return value;
    },
    async submitPassword(settings) {
      if (settings.signOutOfOtherSessions !== true)
        return fail("invalid_request");
      signIn.status = "complete";
      await event("recovery-password");
      return result();
    },
  },
};
if (stage === "complete") signIn.status = "complete";
const signUp = {
  id: undefined,
  status: "missing_requirements",
  unverifiedFields: [],
  missingFields: [],
  async password() {
    this.id = "su_synthetic";
    this.unverifiedFields = ["email_address"];
    await event("signup-password");
    return result();
  },
  async reset() {
    this.id = undefined;
    this.unverifiedFields = [];
    return result();
  },
  async sso(settings) {
    return signIn.sso(settings);
  },
  async finalize({ navigate }) {
    await event("signup-finalize");
    complete();
    await navigate({ session, decorateUrl: (value) => value });
    return result();
  },
  verifications: {
    async sendEmailCode() {
      await event("signup-send");
      return result();
    },
    async verifyEmailCode({ code }) {
      const value = verify(code);
      if (!value.error) {
        signUp.status = "complete";
        signUp.unverifiedFields = [];
      }
      await event("signup-verify");
      return value;
    },
  },
};
const signInSnapshot = { signIn, errors: {}, fetchStatus: "idle" };
const signUpSnapshot = { signUp, errors: {}, fetchStatus: "idle" };
const resources = () => ({
  client: { signIn, signUp, sessions: signedIn ? [session] : [] },
  session: signedIn ? session : null,
  user: signedIn ? user : null,
  organization: null,
});
let lastResources = resources();
function complete() {
  signedIn = true;
  globalThis.sessionStorage.setItem("clerkSyntheticStage", "complete");
  lastResources = resources();
  for (const listener of resourceListeners) listener(lastResources);
  for (const listener of signalListeners) listener();
}
function mountTask(node, props, name) {
  const button = globalThis.document.createElement("button");
  button.textContent = `Complete synthetic ${name} task`;
  button.addEventListener("click", async () => {
    await event(`task-${name}-complete`);
    globalThis.sessionStorage.setItem("syntheticTaskDone", "true");
    globalThis.location.assign(props.redirectUrlComplete);
  });
  node.append(button);
}
globalThis.Clerk = {
  loaded: true,
  status: "ready",
  version: "synthetic-core3-fixture",
  instanceType: "development",
  isStandardBrowser: true,
  get client() {
    return lastResources.client;
  },
  get session() {
    return lastResources.session;
  },
  get user() {
    return lastResources.user;
  },
  organization: null,
  get __internal_lastEmittedResources() {
    return lastResources;
  },
  __internal_state: {
    signInSignal: () => signInSnapshot,
    signUpSignal: () => signUpSnapshot,
    __internal_effect(callback) {
      signalListeners.add(callback);
      callback();
      return () => signalListeners.delete(callback);
    },
  },
  addListener(listener, options) {
    resourceListeners.add(listener);
    if (!options?.skipInitialEmit) listener(lastResources);
    return () => resourceListeners.delete(listener);
  },
  on(eventName, listener) {
    if (eventName === "status")
      globalThis.queueMicrotask(() => listener("ready"));
  },
  off() {},
  mountTaskSetupMFA(node, props) {
    mountTask(node, props, "mfa");
  },
  unmountTaskSetupMFA(node) {
    node.replaceChildren();
  },
  mountTaskResetPassword(node, props) {
    mountTask(node, props, "password");
  },
  unmountTaskResetPassword(node) {
    node.replaceChildren();
  },
  __internal_updateProps() {},
  async signOut() {
    await event("sign-out");
    if (
      scenario === "cleanup-failure" &&
      !globalThis.sessionStorage.getItem("cleanupRetried")
    ) {
      globalThis.sessionStorage.setItem("cleanupRetried", "true");
      throw new Error("Synthetic cleanup unavailable");
    }
    signedIn = false;
    globalThis.sessionStorage.setItem("syntheticSignedOut", "true");
    globalThis.sessionStorage.removeItem("clerkSyntheticStage");
    lastResources = resources();
    for (const listener of resourceListeners) listener(lastResources);
  },
};
