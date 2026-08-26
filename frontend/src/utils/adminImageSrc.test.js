import { describe, expect, it } from "vitest";
import {
  adminImageSrc,
  clearAdminImageBlobPreview,
  encodeAdminPublicImageParam,
  extractAdminImageKey,
  normalizeAdminImageKey,
  resolveAdminPublicImageUrl,
  setAdminImageBlobPreview,
} from "./adminImageSrc.js";

describe("normalizeAdminImageKey", () => {
  it("keeps flat and nested keys", () => {
    expect(normalizeAdminImageKey("constr_preview_abc.jpg")).toBe(
      "constr_preview_abc.jpg"
    );
    expect(normalizeAdminImageKey("constr/preview/a.jpg")).toBe(
      "constr/preview/a.jpg"
    );
  });
});

describe("encodeAdminPublicImageParam", () => {
  it("single-encodes flat keys", () => {
    expect(encodeAdminPublicImageParam("a.jpg")).toBe("a.jpg");
  });

  it("double-encodes nested keys so %2F survives HTTP path", () => {
    expect(encodeAdminPublicImageParam("constr/preview/x.jpg")).toBe(
      "constr%252Fpreview%252Fx.jpg"
    );
  });
});

describe("extractAdminImageKey", () => {
  it("prefers full nested file_name", () => {
    expect(
      extractAdminImageKey({
        file_name: "constr/preview/x.jpg",
        url: "http://localhost:3005/api/v2/public/image/constr%2Fpreview%2Fx.jpg",
      })
    ).toBe("constr/preview/x.jpg");
  });

  it("decodes single- and double-encoded public urls", () => {
    expect(
      extractAdminImageKey({
        url: "http://localhost:3005/api/v2/public/image/constr%2Fpreview%2Fx.jpg",
      })
    ).toBe("constr/preview/x.jpg");
    expect(
      extractAdminImageKey(
        "/api/v2/public/image/constr%252Fpreview%252Fx.jpg"
      )
    ).toBe("constr/preview/x.jpg");
  });

  it("ignores empty stub and foreign urls", () => {
    expect(
      extractAdminImageKey("http://localhost:3005/api/v2/public/image/")
    ).toBe("");
    expect(extractAdminImageKey("https://cdn.example.com/a.jpg")).toBe("");
  });
});

describe("resolveAdminPublicImageUrl", () => {
  it("builds double-encoded same-origin url for nested keys", () => {
    expect(
      resolveAdminPublicImageUrl({
        file_name: "constr/preview/x.jpg",
      })
    ).toBe("/api/v2/public/image/constr%252Fpreview%252Fx.jpg");
  });

  it("rebuilds from server single-encoded url", () => {
    expect(
      resolveAdminPublicImageUrl({
        url: "http://localhost:3005/api/v2/public/image/constr%2Fpreview%2Fa.jpg",
      })
    ).toBe("/api/v2/public/image/constr%252Fpreview%252Fa.jpg");
  });

  it("keeps flat keys", () => {
    expect(
      resolveAdminPublicImageUrl({ file_name: "constr_preview_x.jpg" })
    ).toBe("/api/v2/public/image/constr_preview_x.jpg");
  });
});

describe("adminImageSrc", () => {
  it("prefers blob preview over remote url", () => {
    setAdminImageBlobPreview("constr/preview/a.jpg", "blob:http://localhost/1");
    expect(
      adminImageSrc({
        file_name: "constr/preview/a.jpg",
        url: "http://localhost:3005/api/v2/public/image/constr%2Fpreview%2Fa.jpg",
      })
    ).toBe("blob:http://localhost/1");
    clearAdminImageBlobPreview("constr/preview/a.jpg");
  });

  it("falls back to durable public url", () => {
    expect(
      adminImageSrc({
        file_name: "b.jpg",
        url: "http://localhost:3005/api/v2/public/image/b.jpg",
      })
    ).toBe("/api/v2/public/image/b.jpg");
  });
});
