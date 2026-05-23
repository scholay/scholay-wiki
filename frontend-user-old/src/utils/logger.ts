const isDevelopment =
  process.env.NODE_ENV === 'development' ||
  process.env.REACT_APP_ENABLE_LOGS === 'true';

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) console.log(...args);
  },
  debug: (...args: any[]) => {
    if (isDevelopment) console.debug(...args);
  },
  error: (...args: any[]) => {
    console.error(...args);
  },
  warn: (...args: any[]) => {
    if (isDevelopment) console.warn(...args);
  },
  info: (...args: any[]) => {
    if (isDevelopment) console.info(...args);
  },
};

export default logger;
