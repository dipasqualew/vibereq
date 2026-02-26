import { createLogger as createWinstonLogger, format, transports, Logger } from "winston";
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  SpanExporter,
  ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { trace, Tracer, SpanStatusCode } from "@opentelemetry/api";
import * as fs from "fs";
import * as path from "path";

const SERVICE_NAME = "vibx";
const SERVICE_VERSION = "0.1.0";

export interface ObservabilityConfig {
  branch: string;
  baseDir?: string;
}

interface ExportResult {
  code: number;
}

const ExportResultCode = {
  SUCCESS: 0,
  FAILED: 1,
};

/**
 * Custom file-based span exporter that writes JSONL to disk
 */
class FileSpanExporter implements SpanExporter {
  private filePath: string;
  private writeStream: fs.WriteStream | null = null;

  constructor(outputDir: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.filePath = path.join(outputDir, `trace-${timestamp}.jsonl`);

    // Ensure directory exists
    fs.mkdirSync(outputDir, { recursive: true });
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    try {
      if (!this.writeStream) {
        this.writeStream = fs.createWriteStream(this.filePath, { flags: "a" });
      }

      for (const span of spans) {
        const spanData = {
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          parentSpanId: span.parentSpanId,
          name: span.name,
          kind: span.kind,
          startTime: span.startTime,
          endTime: span.endTime,
          status: span.status,
          attributes: span.attributes,
          events: span.events,
          links: span.links,
        };
        this.writeStream.write(JSON.stringify(spanData) + "\n");
      }

      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      resultCallback({ code: ExportResultCode.FAILED });
    }
  }

  shutdown(): Promise<void> {
    return new Promise((resolve) => {
      if (this.writeStream) {
        this.writeStream.end(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

/**
 * Get current git branch name, sanitized for filesystem use
 */
export async function getCurrentBranch(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    return "unknown";
  }

  return sanitizeBranchName(stdout.trim());
}

/**
 * Sanitize branch name for filesystem safety
 */
export function sanitizeBranchName(branch: string): string {
  return branch.replace(/[/\\:*?"<>|]/g, "-");
}

/**
 * Get output directory for logs/traces
 */
function getOutputDir(branch: string, subdir: string, baseDir = "/tmp/vibx"): string {
  return path.join(baseDir, branch, subdir);
}

/**
 * Create a Winston logger configured for JSONL output
 */
export function createLogger(config: ObservabilityConfig): Logger {
  const logDir = getOutputDir(config.branch, "logs", config.baseDir);
  fs.mkdirSync(logDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(logDir, `vibx-${timestamp}.jsonl`);

  return createWinstonLogger({
    level: process.env.LOG_LEVEL || "info",
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.json()
    ),
    defaultMeta: {
      service: SERVICE_NAME,
      branch: config.branch,
    },
    transports: [
      new transports.File({
        filename: logFile,
        options: { flags: "a" },
      }),
    ],
  });
}

let provider: BasicTracerProvider | null = null;

/**
 * Initialize OpenTelemetry tracing
 */
export function initTracing(config: ObservabilityConfig): Tracer {
  const traceDir = getOutputDir(config.branch, "traces", config.baseDir);

  const exporter = new FileSpanExporter(traceDir);

  provider = new BasicTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      branch: config.branch,
    }),
  });

  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();

  return trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

/**
 * Get the active tracer
 */
export function getTracer(): Tracer {
  return trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

/**
 * Shutdown observability (flush traces)
 */
export async function shutdownObservability(): Promise<void> {
  if (provider) {
    await provider.shutdown();
    provider = null;
  }
}

/**
 * Create a span and execute a function within it
 */
export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      span.setAttributes(attributes);
    }

    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

// Re-export types for convenience
export type { Logger } from "winston";
export type { Tracer } from "@opentelemetry/api";
export { SpanStatusCode } from "@opentelemetry/api";
