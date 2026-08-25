import { describe, expect, it } from "vitest";
import {
  adminImageSrc,
  clearAdminImageBlobPreview,
  setAdminImageBlobPreview,
} from "./adminImageSrc.js";

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

  it("falls back to upload url", () => {
    expect(
      adminImageSrc({
        file_name: "b.jpg",
        url: "http://localhost:3005/api/v2/public/image/b.jpg",
      })
    ).toBe("http://localhost:3005/api/v2/public/image/b.jpg");
  });

  it("ignores empty public image stub urls", () => {
    expect(
      adminImageSrc({
        file_name: "c.jpg",
        url: "http://localhost:3005/api/v2/public/image/",
      })
    ).toBe("");
  });
});
