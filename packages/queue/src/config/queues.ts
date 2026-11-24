export const QUEUE_NAMES = Object.freeze({
  deployment: "deployment",
  build: "build",
  rollback: "rollback",
  diagnostic: "diagnostic",
});

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
