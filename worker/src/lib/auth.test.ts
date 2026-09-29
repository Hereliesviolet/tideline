import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { generate2FACode, generateJWT, verifyJWT } from "./auth";

describe("JWT helpers", () => {
  it("round-trips the payload", () => {
    const token = generateJWT("user-1", "user@example.com", 4);
    expect(verifyJWT(token)).toMatchObject({
      userId: "user-1",
      email: "user@example.com",
      teamLevel: 4,
    });
  });

  it("rejects malformed tokens", () => {
    expect(verifyJWT("not-a-token")).toBeNull();
  });

  it("rejects tokens signed with another secret", () => {
    const forged = jwt.sign({ userId: "user-1" }, "another-secret-another-secret-1234");
    expect(verifyJWT(forged)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const secret = process.env.JWT_SECRET as string;
    const expired = jwt.sign({ userId: "user-1" }, secret, { expiresIn: -10 });
    expect(verifyJWT(expired)).toBeNull();
  });
});

describe("generate2FACode", () => {
  it("returns six digits without a leading zero", () => {
    for (let i = 0; i < 200; i++) {
      expect(generate2FACode()).toMatch(/^[1-9]\d{5}$/);
    }
  });
});
