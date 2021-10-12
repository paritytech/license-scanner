export const logLevel = { debug: 0, info: 1, error: 2 }
export type LogLevel = keyof typeof logLevel

export class Logger {
  private minLevelNumber: number

  constructor(private options: { minLevel: LogLevel }) {
    this.minLevelNumber = logLevel[options.minLevel]
  }

  private logToConsole(level: LogLevel, item: any, context?: string) {
    if (logLevel[level] < this.minLevelNumber) {
      return
    }

    if (context) {
      console.log(`(${level})`, `${context}\n`, item)
    } else {
      console.log(`(${level})`, item)
    }
  }

  debug(msg: any, context?: string) {
    this.logToConsole("debug", msg, context)
  }

  info(msg: any, context?: string) {
    this.logToConsole("info", msg, context)
  }

  fatal(err: any, context?: string) {
    this.logToConsole("error", err, context)
  }
}
