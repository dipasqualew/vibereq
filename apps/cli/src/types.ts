export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ConvMsg {
  role: "user" | "assistant";
  text: string;
}

export interface Location {
  file: string;
  line: number;
  endLine?: number;
}

export interface Finding {
  requirement: string;
  status: string;
  severity: string;
  details: string;
  location: Location | null;
}

export interface ReviewResult {
  reviewerName: string;
  status: string;
  summary: string;
  findings: Finding[];
}

export interface PrOptions {
  dryRun?: boolean;
  skipReview?: boolean;
  base?: string;
}

export interface PrResult {
  success: boolean;
  prNumber?: number;
  prUrl?: string;
  committed: boolean;
  intentGenerated: boolean;
  reviewPosted: boolean;
  errors: string[];
}

export interface ThreadComment {
  body: string;
  author: string;
  createdAt: string;
}

export interface ReviewThreadDetail {
  id: string;
  path: string;
  line: number;
  comments: ThreadComment[];
}

export interface AddressPrResult {
  success: boolean;
  prNumber?: number;
  threads: ReviewThreadDetail[];
  diff: string;
  errors: string[];
}
