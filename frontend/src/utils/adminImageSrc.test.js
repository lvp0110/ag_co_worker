import { describe, expect, it } from "vitest";
import {
  adminImageSrc,
  clearAdminImageBlobPreview,
  extractAdminImageKey,
  flattenAdminImageKey,
  resolveAdminPublicImageUrl,
  setAdminImageBlobPreview,
} from "./adminImageSrc.js";

describe("flattenAdminImageKey", () => {
  it("keeps flat keys", () => {
    expect(flattenAdminImageKey("constr_preview_abc.jpg")).toBe(
      "constr_preview_abc.jpg"
    );
  });

  it("takes basename from nested keys", () => {
    expect(flattenAdminImageKey("constr/preview/a.jpg")).toBe("a.jpg");
  });
});

describe("extractAdminImageKey", () => {
  it("prefers file_name over nested url", () => {
    expect(
      extractAdminImageKey({
        file_name: "constr_preview_x.jpg",
        url: "http://localhost:3005/api/v2/public/image/constr/preview/x.jpg",
      })
    ).toBe("constr_preview_x.jpg");
  });

  it("reads flat key from public url", () => {
    expect(
      extractAdminImageKey(
        "http://localhost:3005/api/v2/public/image/constr_preview_x.jpg"
      )
    ).toBe("constr_preview_x.jpg");
  });

  it("ignores empty public stub and foreign urls", () => {
    expect(
      extractAdminImageKey("http://localhost:3005/api/v2/public/image/")
    ).toBe("");
    expect(extractAdminImageKey("https://cdn.example.com/a.jpg")).toBe("");
  });
});

describe("resolveAdminPublicImageUrl", () => {
  it("builds same-origin public url from file_name", () => {
    expect(
      resolveAdminPublicImageUrl({
        file_name: "constr_preview_x.jpg",
        url: "http://localhost:3005/api/v2/public/image/constr/preview/x.jpg",
      })
    ).toBe("/api/v2/public/image/constr_preview_x.jpg");
  });

  it("flattens nested public url without file_name", () => {
    expect(
      resolveAdminPublicImageUrl({
        url: "http://localhost:3005/api/v2/public/image/constr/preview/a.jpg",
      })
    ).toBe("/api/v2/public/image/a.jpg");
  });
});

describe("adminImageSrc", () => {
  it("prefers blob preview over remote url", () => {
    setAdminImageBlobPreview("a.jpg", "blob:http://localhost/1");
    expect(
      adminImageSrc({
        file_name: "a.jpg",
        url: "http://localhost:3005/api/v2/public/image/constr/preview/a.jpg",
      })
    ).toBe("blob:http://localhost/1");
    clearAdminImageBlobPreview("a.jpg");
  });

  it("falls back to durable public url", () => {
    expect(
      adminImageSrc({
        file_name: "b.jpg",
        url: "http://localhost:3005/api/v2/public/image/b.jpg",
      })
    ).toBe("/api/v2/public/image/b.jpg");
  });

  it("ignores empty public image stub urls", () => {
    expect(
      adminImageSrc({
        file_name: "",
        url: "http://localhost:3005/api/v2/public/image/",
      })
    ).toBe("");
  });
});
