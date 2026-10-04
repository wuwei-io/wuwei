export const IMAGE_MODEL: string;
export class SubscriptionImageError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>);
}
export interface SubscriptionImageOptions {
  prompt: string;
  accessToken: string;
  accountId: string;
  responsesEndpoint?: string;
  out?: string;
  references?: string[];
  transparentBackground?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface SubscriptionImageResult {
  ok: true;
  backend: string;
  model: string;
  path: string;
  bytes: number;
  width: number;
  height: number;
  requestId?: string;
  elapsedMs: number;
}
export function imageEndpoint(responsesEndpoint?: string, edit?: boolean): string;
export function validateSubscriptionPng(buffer: Buffer): { width: number; height: number };
export function generateSubscriptionImage(options: SubscriptionImageOptions, transport?: typeof fetch): Promise<SubscriptionImageResult>;
