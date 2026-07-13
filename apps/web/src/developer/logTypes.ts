export type DeveloperLogLevel =
  | "error"
  | "warning"
  | "info";

export interface DeveloperLogEntry {
  id: string;
  timestamp: string;
  level: DeveloperLogLevel;
  source: string;
  message: string;
  details: string | null;
  stack: string | null;
}

