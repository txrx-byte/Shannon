export interface LogEntry {
  timestamp: number;
  level: string;
  service: string;
  message: string;
}

export interface LogStats {
  level: string;
  count: number;
  first_seen: number;
  last_seen: number;
}

export interface TimeBucketEntry {
  bucket: string;
  ERROR: number;
  WARN: number;
  INFO: number;
}

export interface TimeRange {
  start: Date;
  end: Date;
}
