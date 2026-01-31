type Level = 'debug' | 'info' | 'warn' | 'error';

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

export const logger = {
  debug(message: string, meta?: unknown) {
    if (isProd()) return;
    // eslint-disable-next-line no-console
    console.debug(message, meta);
  },
  info(message: string, meta?: unknown) {
    if (isProd()) return;
    // eslint-disable-next-line no-console
    console.info(message, meta);
  },
  warn(message: string, meta?: unknown) {
    if (isProd()) return;
    // eslint-disable-next-line no-console
    console.warn(message, meta);
  },
  error(message: string, meta?: unknown) {
    if (isProd()) return;
    // eslint-disable-next-line no-console
    console.error(message, meta);
  }
};

