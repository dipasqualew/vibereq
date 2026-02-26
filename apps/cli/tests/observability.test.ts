import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { sanitizeBranchName, createLogger, withSpan } from "../src/lib/observability.js";
import type { Tracer, Span } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";

describe("sanitizeBranchName", () => {
  const testCases: Array<{ input: string; expected: string; description: string }> = [
    { input: "main", expected: "main", description: "simple branch name unchanged" },
    { input: "feature/add-tests", expected: "feature-add-tests", description: "forward slash replaced" },
    { input: "feature\\add-tests", expected: "feature-add-tests", description: "backslash replaced" },
    { input: "fix:urgent", expected: "fix-urgent", description: "colon replaced" },
    { input: "test*wildcard", expected: "test-wildcard", description: "asterisk replaced" },
    { input: 'name?"quoted', expected: "name--quoted", description: "question mark and double quote replaced" },
    { input: "path<dir>file", expected: "path-dir-file", description: "angle brackets replaced" },
    { input: "pipe|char", expected: "pipe-char", description: "pipe replaced" },
    { input: "feature/sub/deep", expected: "feature-sub-deep", description: "multiple slashes replaced" },
    { input: "mix/of\\chars:here", expected: "mix-of-chars-here", description: "multiple special chars replaced" },
    { input: "", expected: "", description: "empty string unchanged" },
    { input: "already-safe", expected: "already-safe", description: "hyphenated name unchanged" },
    { input: "underscore_name", expected: "underscore_name", description: "underscores unchanged" },
    { input: "dots.in.name", expected: "dots.in.name", description: "dots unchanged" },
  ];

  testCases.forEach(({ input, expected, description }) => {
    it(description, () => {
      expect(sanitizeBranchName(input)).toBe(expected);
    });
  });
});

describe("createLogger", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibx-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns a logger with standard logging methods", () => {
    const logger = createLogger({ branch: "test-branch", baseDir: tempDir });

    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("creates the log directory structure", () => {
    createLogger({ branch: "test-branch", baseDir: tempDir });

    const logDir = path.join(tempDir, "test-branch", "logs");
    expect(fs.existsSync(logDir)).toBe(true);
  });

  it("handles sanitized branch names in directory structure", () => {
    const sanitizedBranch = sanitizeBranchName("feature/test");
    createLogger({ branch: sanitizedBranch, baseDir: tempDir });

    const logDir = path.join(tempDir, sanitizedBranch, "logs");
    expect(fs.existsSync(logDir)).toBe(true);
  });
});

describe("withSpan", () => {
  // Create a minimal mock tracer that captures span behavior
  function createMockTracer(): {
    tracer: Tracer;
    capturedSpans: Array<{
      name: string;
      attributes: Record<string, string | number | boolean>;
      status: { code: number; message?: string };
      ended: boolean;
      exception?: Error;
    }>;
  } {
    const capturedSpans: Array<{
      name: string;
      attributes: Record<string, string | number | boolean>;
      status: { code: number; message?: string };
      ended: boolean;
      exception?: Error;
    }> = [];

    const tracer: Tracer = {
      startSpan: () => {
        throw new Error("Not implemented");
      },
      startActiveSpan: ((name: string, fn: (span: Span) => Promise<unknown>) => {
        const spanData = {
          name,
          attributes: {} as Record<string, string | number | boolean>,
          status: { code: SpanStatusCode.UNSET } as { code: number; message?: string },
          ended: false,
          exception: undefined as Error | undefined,
        };
        capturedSpans.push(spanData);

        const mockSpan: Partial<Span> = {
          setAttributes: (attrs: Record<string, string | number | boolean>) => {
            Object.assign(spanData.attributes, attrs);
            return mockSpan as Span;
          },
          setStatus: (status: { code: number; message?: string }) => {
            spanData.status = status;
            return mockSpan as Span;
          },
          recordException: (exception: Error) => {
            spanData.exception = exception;
          },
          end: () => {
            spanData.ended = true;
          },
        };

        return fn(mockSpan as Span);
      }) as Tracer["startActiveSpan"],
    };

    return { tracer, capturedSpans };
  }

  it("returns the value from the wrapped function", async () => {
    const { tracer } = createMockTracer();

    const result = await withSpan(tracer, "test-span", async () => {
      return "expected-value";
    });

    expect(result).toBe("expected-value");
  });

  it("sets span status to OK on success", async () => {
    const { tracer, capturedSpans } = createMockTracer();

    await withSpan(tracer, "success-span", async () => {
      return "ok";
    });

    expect(capturedSpans).toHaveLength(1);
    expect(capturedSpans[0]!.status.code).toBe(SpanStatusCode.OK);
  });

  it("ends the span after successful execution", async () => {
    const { tracer, capturedSpans } = createMockTracer();

    await withSpan(tracer, "ending-span", async () => {
      return "done";
    });

    expect(capturedSpans[0]!.ended).toBe(true);
  });

  it("passes attributes to the span", async () => {
    const { tracer, capturedSpans } = createMockTracer();

    await withSpan(
      tracer,
      "attributed-span",
      async () => "result",
      { key1: "value1", key2: 42, key3: true }
    );

    expect(capturedSpans[0]!.attributes).toEqual({
      key1: "value1",
      key2: 42,
      key3: true,
    });
  });

  it("sets span status to ERROR and rethrows on failure", async () => {
    const { tracer, capturedSpans } = createMockTracer();
    const testError = new Error("Test failure");

    await expect(
      withSpan(tracer, "error-span", async () => {
        throw testError;
      })
    ).rejects.toThrow("Test failure");

    expect(capturedSpans[0]!.status.code).toBe(SpanStatusCode.ERROR);
    expect(capturedSpans[0]!.status.message).toBe("Test failure");
  });

  it("records exception on failure", async () => {
    const { tracer, capturedSpans } = createMockTracer();

    await expect(
      withSpan(tracer, "exception-span", async () => {
        throw new Error("Exception message");
      })
    ).rejects.toThrow();

    expect(capturedSpans[0]!.exception).toBeInstanceOf(Error);
    expect(capturedSpans[0]!.exception?.message).toBe("Exception message");
  });

  it("ends the span even after failure", async () => {
    const { tracer, capturedSpans } = createMockTracer();

    await expect(
      withSpan(tracer, "failure-ending-span", async () => {
        throw new Error("Fails");
      })
    ).rejects.toThrow();

    expect(capturedSpans[0]!.ended).toBe(true);
  });

  it("handles non-Error thrown values", async () => {
    const { tracer, capturedSpans } = createMockTracer();

    await expect(
      withSpan(tracer, "string-throw-span", async () => {
        throw "string error";
      })
    ).rejects.toBe("string error");

    expect(capturedSpans[0]!.status.code).toBe(SpanStatusCode.ERROR);
    expect(capturedSpans[0]!.status.message).toBe("string error");
  });

  it("uses span name correctly", async () => {
    const { tracer, capturedSpans } = createMockTracer();

    await withSpan(tracer, "my-custom-span-name", async () => "ok");

    expect(capturedSpans[0]!.name).toBe("my-custom-span-name");
  });
});
