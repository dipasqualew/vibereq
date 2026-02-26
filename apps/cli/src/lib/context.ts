import {
  createLogger,
  initTracing,
  getCurrentBranch,
  Logger,
  Tracer,
} from "./observability.js";

export interface AppContext {
  logger: Logger;
  tracer: Tracer;
  branch: string;
}

export interface AppContextConfig {
  baseDir?: string;
}

/**
 * Create the application context with logger and tracer
 */
export async function createAppContext(config: AppContextConfig = {}): Promise<AppContext> {
  const branch = await getCurrentBranch();

  const observabilityConfig = {
    branch,
    baseDir: config.baseDir,
  };

  const logger = createLogger(observabilityConfig);
  const tracer = initTracing(observabilityConfig);

  return {
    logger,
    tracer,
    branch,
  };
}
