declare interface Hyperdrive {
  connectionString: string;
}

declare interface Message<T> {
  body: T;
  ack(): void;
  retry(): void;
}

declare interface MessageBatch<T> {
  messages: Array<Message<T>>;
}

declare type MessageSendRequest<T> = {
  body: T;
  contentType: 'json' | 'text' | 'bytes' | 'v8';
};

declare interface Queue<T> {
  sendBatch(messages: Array<MessageSendRequest<T>>): Promise<void>;
}

declare interface SecretsStoreSecret {
  get(): Promise<string>;
}

declare interface GitTokenService {
  getToken(installationId: string, appType?: 'standard' | 'lite'): Promise<string>;
}

declare interface CloudflareEnv {
  SECURITY_SYNC_WORKER_AUTH_TOKEN: SecretsStoreSecret;
  SECURITY_SYNC_WORKER_HMAC_SECRET: SecretsStoreSecret;
  SYNC_QUEUE: Queue<import('./src/index').SecuritySyncMessage>;
  HYPERDRIVE: Hyperdrive;
  GIT_TOKEN_SERVICE: GitTokenService;
}
