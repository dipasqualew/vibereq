import { describe, it, expect } from "vitest";
import { REVIEW_COMMENT_HEADER } from "../src/lib/github.js";

describe("REVIEW_COMMENT_HEADER", () => {
  it("should be defined as the Vibereq review header", () => {
    expect(REVIEW_COMMENT_HEADER).toBe("# Vibereq Review");
  });
});

describe("archive review body formatting", () => {
  const createArchivedBody = (originalBody: string, newReviewUrl: string): string => {
    return `<details>
<summary>[review superseded by <a href="${newReviewUrl}">new review</a>]</summary>

${originalBody}
</details>`;
  };

  it("should wrap original body in details/summary HTML element", () => {
    const originalBody = "# Vibereq Review\n\n## Test Reviewer\n**Overall Status:** pass";
    const newReviewUrl = "https://github.com/owner/repo/pull/1#pullrequestreview-123";

    const archived = createArchivedBody(originalBody, newReviewUrl);

    expect(archived).toContain("<details>");
    expect(archived).toContain("</details>");
    expect(archived).toContain("<summary>");
    expect(archived).toContain("</summary>");
  });

  it("should include link to new review in summary", () => {
    const originalBody = "# Vibereq Review\n\nContent";
    const newReviewUrl = "https://github.com/owner/repo/pull/1#pullrequestreview-456";

    const archived = createArchivedBody(originalBody, newReviewUrl);

    expect(archived).toContain(`<a href="${newReviewUrl}">new review</a>`);
    expect(archived).toContain("[review superseded by");
  });

  it("should preserve original body content inside details element", () => {
    const originalBody = "# Vibereq Review\n\n## My Reviewer\n**Overall Status:** fail\n\n### Critical Finding\nSome details here";
    const newReviewUrl = "https://github.com/owner/repo/pull/1#pullrequestreview-789";

    const archived = createArchivedBody(originalBody, newReviewUrl);

    expect(archived).toContain(originalBody);
  });

  it("should produce valid GitHub Flavoured Markdown HTML", () => {
    const originalBody = "# Vibereq Review\n\nTest";
    const newReviewUrl = "https://github.com/owner/repo/pull/1#pullrequestreview-100";

    const archived = createArchivedBody(originalBody, newReviewUrl);

    // GitHub Flavoured Markdown requires HTML elements to be on their own lines
    const lines = archived.split("\n");
    expect(lines[0]).toBe("<details>");
    expect(lines[lines.length - 1]).toBe("</details>");
  });
});

describe("Vibereq review detection", () => {
  const isVibereqReview = (body: string): boolean => {
    return body?.includes(REVIEW_COMMENT_HEADER) && !body?.includes("<details>");
  };

  it("should identify reviews with the Vibereq header", () => {
    const body = "# Vibereq Review\n\n## Test Reviewer\n**Overall Status:** pass";
    expect(isVibereqReview(body)).toBe(true);
  });

  it("should not identify reviews without the header", () => {
    const body = "# Some Other Review\n\nThis is a regular comment";
    expect(isVibereqReview(body)).toBe(false);
  });

  it("should not identify already-archived reviews", () => {
    const body = `<details>
<summary>[review superseded by <a href="url">new review</a>]</summary>

# Vibereq Review

## Test Reviewer
**Overall Status:** pass
</details>`;
    expect(isVibereqReview(body)).toBe(false);
  });

  it("should handle empty or null bodies", () => {
    expect(isVibereqReview("")).toBe(false);
    // Optional chaining returns undefined for null/undefined, which is falsy
    expect(isVibereqReview(null as unknown as string)).toBeFalsy();
    expect(isVibereqReview(undefined as unknown as string)).toBeFalsy();
  });
});
