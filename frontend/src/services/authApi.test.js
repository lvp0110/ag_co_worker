import { describe, expect, it } from "vitest";
import { extractUserRecord, mapExternalUser } from "./authApi.js";
import { extractAuthTokensFromBody } from "./apiClient.js";

const adminUser = {
  user_id: "u-1",
  first_name: "Иван",
  last_name: "Петров",
  middle_name: "Иванович",
  email: "admin@example.com",
  role_type: "admin",
  is_active: true,
  department_id: 3,
};

describe("extractUserRecord", () => {
  it("unwraps login UserCredentials.data.user (GitHub Pages / POST /login)", () => {
    expect(
      extractUserRecord({
        code: 200,
        data: {
          user: adminUser,
          expires_at: "2026-01-01T00:00:00Z",
          refresh_expires_at: "2026-01-02T00:00:00Z",
        },
      })
    ).toEqual(adminUser);
  });

  it("unwraps session UserFullInfo in data", () => {
    expect(extractUserRecord({ code: 200, data: adminUser })).toEqual(adminUser);
  });

  it("unwraps bare credentials.user", () => {
    expect(extractUserRecord({ user: adminUser, expires_at: "x" })).toEqual(
      adminUser
    );
  });
});

describe("mapExternalUser", () => {
  it("sets ADMIN from login envelope so the header shows Админка after POST /login", () => {
    const mapped = mapExternalUser({
      code: 200,
      data: { user: adminUser, expires_at: "x" },
    });
    expect(mapped).toMatchObject({
      id: "u-1",
      email: "admin@example.com",
      full_name: "Петров Иван Иванович",
      role: "ADMIN",
      department_id: 3,
    });
  });

  it("reads nested user from credentials wrapper, not the wrapper itself", () => {
    const credentials = {
      user: adminUser,
      expires_at: "x",
    };
    expect(mapExternalUser(credentials).role).toBe("ADMIN");
    expect(mapExternalUser(credentials).email).toBe("admin@example.com");
  });

  it("sets ADMIN from session-shaped data", () => {
    expect(mapExternalUser({ code: 200, data: adminUser }).role).toBe("ADMIN");
  });

  it("accepts role as well as role_type", () => {
    expect(
      mapExternalUser({ ...adminUser, role_type: undefined, role: "ADMIN" })
        .role
    ).toBe("ADMIN");
  });

  it("maps ordinary users as USER", () => {
    expect(
      mapExternalUser({ ...adminUser, role_type: "user", email: "u@x.y" }).role
    ).toBe("USER");
  });

  it("returns null for empty payload", () => {
    expect(mapExternalUser(null)).toBeNull();
    expect(mapExternalUser({})).toBeNull();
  });
});

describe("extractAuthTokensFromBody", () => {
  it("reads tokens from login UserCredentials envelope", () => {
    expect(
      extractAuthTokensFromBody({
        code: 200,
        data: {
          user: adminUser,
          access_token: "acc",
          refresh_token: "ref",
        },
      })
    ).toEqual({ access_token: "acc", refresh_token: "ref" });
  });

  it("ignores browser-masked login without tokens", () => {
    expect(
      extractAuthTokensFromBody({
        code: 200,
        data: { user: adminUser, expires_at: "x" },
      })
    ).toEqual({ access_token: "", refresh_token: "" });
  });

  it("accepts token as access_token alias", () => {
    expect(
      extractAuthTokensFromBody({ data: { token: "jwt", refreshToken: "r" } })
    ).toEqual({ access_token: "jwt", refresh_token: "r" });
  });
});
