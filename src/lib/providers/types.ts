import type { BYOKResult } from '@/lib/byok';
import type { GatewayRequest } from '@/lib/providers/openrouter/types';

export type ProviderId =
  | 'openrouter'
  | 'alibaba'
  | 'bytedance'
  | 'corethink'
  | 'martian'
  | 'mistral'
  | 'morph'
  | 'vercel'
  | 'custom'
  | 'dev-tools';

export type TransformRequestContext = {
  model: string;
  request: GatewayRequest;
  extraHeaders: Record<string, string>;
  userByok: BYOKResult[] | null;
};

export type Provider = {
  id: ProviderId;
  apiUrl: string;
  apiKey: string;
  transformRequest(context: TransformRequestContext): void;
};
