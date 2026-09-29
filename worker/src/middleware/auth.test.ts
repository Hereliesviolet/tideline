import type { NextFunction, Response } from "express";
import { describe, expect, it, vi } from "vitest";

// The middleware module imports the Prisma client; the guards under test never use it.
vi.mock("../db", () => ({ prisma: {} }));

import { requireAdminLevel, requireSuperUser, type AuthRequest } from "./auth";

function run(
  guard: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>,
  user?: Partial<NonNullable<AuthRequest["user"]>>,
) {
  const req = { user } as AuthRequest;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status } as unknown as Response;
  const next = vi.fn();
  return guard(req, res, next).then(() => ({ next, status, json }));
}

describe("requireAdminLevel", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const { next, status } = await run(requireAdminLevel(4));
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects users below the required level with 403", async () => {
    const { next, status } = await run(requireAdminLevel(4), { teamLevel: 3, superUser: false });
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows users at or above the required level", async () => {
    const { next, status } = await run(requireAdminLevel(4), { teamLevel: 4 });
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("always allows super users", async () => {
    const { next } = await run(requireAdminLevel(7), { teamLevel: 0, superUser: true });
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("requireSuperUser", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const { status } = await run(requireSuperUser());
    expect(status).toHaveBeenCalledWith(401);
  });

  it("rejects regular users even at the highest team level", async () => {
    const { next, status } = await run(requireSuperUser(), { teamLevel: 7, superUser: false });
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows super users", async () => {
    const { next } = await run(requireSuperUser(), { teamLevel: 0, superUser: true });
    expect(next).toHaveBeenCalledOnce();
  });
});
