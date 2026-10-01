import { describe, expect, it } from "vitest";
import {
  constructionDisplayCipher,
  constructionPublicCipher,
  constructionVisibleText,
} from "./constructionCiphers.js";

describe("construction public cipher", () => {
  it("drops the underscore and everything after it", () => {
    expect(constructionPublicCipher("AG.W101")).toBe("AG.W101");
    expect(constructionPublicCipher("AG.W101_")).toBe("AG.W101");
    expect(constructionPublicCipher("AG.W101__")).toBe("AG.W101");
    expect(constructionPublicCipher(" AG.L401_2 ")).toBe("AG.L401");
  });

  it("hides the suffix in the cipher column and keeps special dashes", () => {
    expect(
      constructionDisplayCipher({ agId: "AG.W101_", calcCode: "AG.W101_" })
    ).toBe("AG.W101");
    expect(
      constructionDisplayCipher({ agId: "AG.Ct_eco", calcCode: "AG.Ct_eco" })
    ).toBe("—");
    expect(
      constructionDisplayCipher({ agId: "AG.C501_ul", calcCode: "AG.C501_ul" })
    ).toBe("—");
  });

  it("strips a title only when the whole string is a cipher", () => {
    expect(constructionVisibleText("AG.W101_")).toBe("AG.W101");
    expect(constructionVisibleText("Каркасная AG.W101_")).toBe(
      "Каркасная AG.W101_"
    );
  });
});
