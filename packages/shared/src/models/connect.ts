import mongoose from 'mongoose';

export interface ConnectOptions {
  uri: string;
  /** Called on connect/disconnect/error so each app can use its own logger. */
  onEvent?: (event: 'connected' | 'disconnected' | 'error', detail?: unknown) => void;
}

let connecting: Promise<typeof mongoose> | null = null;

/**
 * Connects mongoose once per process. Both the server and the worker call this
 * on boot; indexes declared on the schemas are built here via autoIndex, which
 * is fine for an internal tool of this size.
 */
export async function connectMongo({ uri, onEvent }: ConnectOptions): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;

  mongoose.connection.on('connected', () => onEvent?.('connected'));
  mongoose.connection.on('disconnected', () => onEvent?.('disconnected'));
  mongoose.connection.on('error', (err) => onEvent?.('error', err));

  connecting = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: true,
  });

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/** True when a write failed because it hit a unique index. */
export function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: number }).code === 11000);
}

export { mongoose };
