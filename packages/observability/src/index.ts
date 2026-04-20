export interface Logger {
  info(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

const write = (level: "info" | "error", message: string, metadata: Record<string, unknown>) => {
  const payload = {
    level,
    message,
    ...metadata,
    timestamp: new Date().toISOString(),
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
};

export const logger: Logger = {
  info(message, metadata = {}) {
    write("info", message, metadata);
  },
  error(message, metadata = {}) {
    write("error", message, metadata);
  },
};

const counters = new Map<string, number>();

export const incrementCounter = (name: string, labels: Record<string, string> = {}): number => {
  const key = `${name}:${JSON.stringify(labels)}`;
  const nextValue = (counters.get(key) ?? 0) + 1;
  counters.set(key, nextValue);

  logger.info("metric.increment", {
    metric: name,
    labels,
    value: nextValue,
  });

  return nextValue;
};

export const recordGauge = (name: string, value: number, labels: Record<string, string> = {}): void => {
  logger.info("metric.gauge", {
    metric: name,
    labels,
    value,
  });
};

export const observeDuration = (name: string, durationMs: number, labels: Record<string, string> = {}): void => {
  logger.info("metric.duration", {
    metric: name,
    labels,
    durationMs,
  });
};
