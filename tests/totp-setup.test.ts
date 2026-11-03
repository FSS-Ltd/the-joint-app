import { expect, it } from "vitest";
import { getTotpSetupUri } from "../packages/identity-runtime/src/totp-setup.js";

const secret = "SYNTHETICKEY";
const uri = `otpauth://totp/The%20Family%20Fund:sample?secret=${secret}`;

it("preserves a matching creation URI and supported provider parameters", () => {
  for (const algorithm of ["SHA1", "SHA256", "SHA512"]) {
    const value = `${uri}&issuer=The%20Family%20Fund&algorithm=${algorithm}&digits=6&period=30`;
    expect(getTotpSetupUri(value, secret)).toBe(value);
  }
  expect(getTotpSetupUri(uri, secret)).toBe(uri);
  // Factor validity belongs to the provider, including its choice of key length.
  expect(getTotpSetupUri("otpauth://totp/sample?secret=A", "A")).toBe(
    "otpauth://totp/sample?secret=A",
  );
});

it.each([
  null,
  undefined,
  123,
  "",
  `https://totp/sample?secret=${secret}`,
  `otpauth://hotp/sample?secret=${secret}`,
  `otpauth://totp/?secret=${secret}`,
  `otpauth://totp/%20?secret=${secret}`,
  `otpauth://user@totp/sample?secret=${secret}`,
  `otpauth://@totp/sample?secret=${secret}`,
  `otpauth://totp:123/sample?secret=${secret}`,
  `otpauth://totp:/sample?secret=${secret}`,
  `${uri}#fragment`,
  `${uri}#`,
  `${uri}\n`,
  `${uri}&issuer=%0Ahidden`,
  `otpauth://totp/%00sample?secret=${secret}`,
  `otpauth://totp/%ZZ?secret=${secret}`,
  `${uri}&secret=${secret}`,
  `${uri}&%73ecret=${secret}`,
  `${uri}&issuer=a&issuer=b`,
  `${uri}&algorithm=MD5`,
  `${uri}&digits=8`,
  `${uri}&period=60`,
  `${uri}&unknown=value`,
  `${uri}&issuer=${"x".repeat(2048)}`,
])("rejects hostile or unsupported setup URI case %#", (value) => {
  expect(getTotpSetupUri(value, secret)).toBeNull();
});

it("rejects missing, unbounded, or mismatched creation keys", () => {
  for (const value of [
    null,
    undefined,
    123,
    "",
    " ",
    "OTHER",
    "x".repeat(2049),
  ])
    expect(getTotpSetupUri(uri, value)).toBeNull();
  expect(getTotpSetupUri("otpauth://totp/sample", secret)).toBeNull();
});
