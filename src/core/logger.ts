import pc from "picocolors";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { LOGS_DIR } from "./paths.js";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private logFile: string;

  constructor() {
    const logDir = LOGS_DIR;
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    this.logFile = path.join(logDir, "app.log");
    
    if (process.env.LULU_DEBUG === "true") {
      this.level = LogLevel.DEBUG;
    }
  }

  setLogLevel(level: LogLevel) {
    this.level = level;
  }

  private format(level: string, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    let formattedArgs = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    const fullMessage = `${timestamp} [${level}] ${message} ${formattedArgs}`;
    this.writeToFile(fullMessage);
    return fullMessage;
  }

  private writeToFile(message: string) {
    try {
      appendFileSync(this.logFile, message + "\n");
    } catch {
      // Fallback if file writing fails
    }
  }

  debug(message: string, ...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(pc.gray(this.format("DEBUG", message, ...args)));
    }
  }

  info(message: string, ...args: any[]) {
    if (this.level <= LogLevel.INFO) {
      console.info(pc.blue(this.format("INFO", message, ...args)));
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.level <= LogLevel.WARN) {
      console.warn(pc.yellow(this.format("WARN", message, ...args)));
    }
  }

  error(message: string, ...args: any[]) {
    if (this.level <= LogLevel.ERROR) {
      console.error(pc.red(this.format("ERROR", message, ...args)));
    }
  }
}

export const logger = new Logger();
