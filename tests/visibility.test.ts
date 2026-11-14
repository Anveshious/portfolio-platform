import { describe, expect, it } from "vitest";
import { isPubliclyVisible, publishBlockers } from "@/modules/projects/visibility";

describe("project visibility rules", () => {
  const states = ["draft", "published", "unpublished"] as const;
  const vis = ["public", "hidden"] as const;

  it("only published + public is visible (full matrix)", () => {
    for (const publication_state of states)
      for (const visibility of vis)
        expect(isPubliclyVisible({ publication_state, visibility })).toBe(publication_state === "published" && visibility === "public");
  });

  it("publishing requires an owner-written short description", () => {
    expect(publishBlockers({ title: "T", slug: "t", short_description: "" })).toHaveLength(1);
    expect(publishBlockers({ title: "T", slug: "t", short_description: "  " })).toHaveLength(1);
    expect(publishBlockers({ title: "T", slug: "t", short_description: "Real text" })).toEqual([]);
  });
});
