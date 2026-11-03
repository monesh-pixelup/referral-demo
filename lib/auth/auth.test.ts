import { describe, expect, it } from "vitest";
import { signSession, verifySession, SESSION_MAX_AGE } from "./token";
import { can } from "./permissions";

const user = { role: "partner" as const, name: "Ananya Rao", email: "ananya@growthloop.in", partnerId: "prt_1" };

describe("session token", () => {
  it("round-trips a signed session", () => {
    expect(verifySession(signSession(user))).toEqual(user);
  });
  it("rejects a tampered payload or signature", () => {
    const [body, sig] = signSession(user).split(".");
    const forged = Buffer.from(JSON.stringify({ ...user, role: "admin", exp: 9e9 })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`)).toBeNull();
    expect(verifySession(`${body}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(verifySession("garbage")).toBeNull();
    expect(verifySession(undefined)).toBeNull();
  });
  it("expires", () => {
    const t = signSession(user, Date.now() - (SESSION_MAX_AGE + 10) * 1000);
    expect(verifySession(t)).toBeNull();
  });
});

describe("permissions", () => {
  it("admin can do everything; team runs the pipeline and payments only; partners nothing", () => {
    expect(can("admin", "payout.write")).toBe(true);
    expect(can("team", "referral.pipeline")).toBe(true);
    expect(can("team", "payment.write")).toBe(true);
    for (const p of ["referral.decide", "payout.write", "partner.write", "application.review", "demo.reset"] as const) {
      expect(can("team", p)).toBe(false);
      expect(can("partner", p)).toBe(false);
    }
  });
});
