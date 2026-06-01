export type LogFields = Record<string, unknown>;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEntry = {
  level: LogLevel;
  message: string;
  ts: string;
  fields?: LogFields;
};

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const thresholdFromEnv = (): LogLevel => {
  const raw = (typeof process !== 'undefined' ? process.env?.LOG_LEVEL : undefined) ?? 'info';
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
};

export class Logger {
  private readonly threshold: number;
  private readonly sink: (entry: LogEntry) => void;

  constructor(opts?: { level?: LogLevel; sink?: (entry: LogEntry) => void }) {
    this.threshold = LEVELS[opts?.level ?? thresholdFromEnv()];
    this.sink =
      opts?.sink ??
      ((entry) => {
        const out = entry.level === 'error' || entry.level === 'warn' ? 'stderr' : 'stdout';
        const line = JSON.stringify({
          level: entry.level,
          ts: entry.ts,
          message: entry.message,
          ...entry.fields
        });
        if (out === 'stderr') console.error(line);
        else console.log(line);
      });
  }

  debug(message: string, fields?: LogFields): void {
    this.emit('debug', message, fields);
  }
  info(message: string, fields?: LogFields): void {
    this.emit('info', message, fields);
  }
  warn(message: string, fields?: LogFields): void {
    this.emit('warn', message, fields);
  }
  error(message: string, fields?: LogFields): void {
    this.emit('error', message, fields);
  }

  child(fields: LogFields): Logger {
    return {
      debug: (m, f) => this.debug(m, { ...fields, ...f }),
      info: (m, f) => this.info(m, { ...fields, ...f }),
      warn: (m, f) => this.warn(m, { ...fields, ...f }),
      error: (m, f) => this.error(m, { ...fields, ...f })
    } as Logger;
  }

  private emit(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVELS[level] < this.threshold) return;
    this.sink({ level, message, ts: new Date().toISOString(), fields });
  }
}

export const logger = new Logger();
