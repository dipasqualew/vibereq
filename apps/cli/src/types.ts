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
