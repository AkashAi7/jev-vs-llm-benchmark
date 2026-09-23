import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { ConfigUpdate, PublicConfig, RunOptions } from '../shared/types';
import { LabError } from './errors';

export interface ProviderConfig {
  jevKey: string;
  jevModel: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
}

const modelName = z.string().trim().min(1).max(128).regex(/^[\w./:-]+$/);
export const configSchema = z.object({
  jevKey: z.string().trim().min(1).max(2048).optional(),
  jevModel: modelName.optional(),
  llmApiKey: z.string().trim().min(1).max(4096).optional(),
  llmBaseUrl: z.string().trim().max(500).optional(),
  llmModel: modelName.or(z.literal('')).optional(),
  clearKeys: z.boolean().optional(),
}).strict();

export function normalizeBaseUrl(value: string): string {
  if (!value) return '';
  let url: URL;
  try { url = new URL(value); } catch { throw new LabError('Use a valid OpenAI-compatible base URL.'); }
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if ((!loopback && url.protocol !== 'https:') || (loopback && !['http:', 'https:'].includes(url.protocol))
      || url.username || url.password || url.search || url.hash) {
    throw new LabError('Use HTTPS for remote LLM endpoints. Loopback HTTP is allowed for local model servers. URLs cannot contain credentials, query strings, or fragments.');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname}/`;
}

export class Configuration {
  private value: ProviderConfig;
  readonly csrfToken = randomBytes(32).toString('hex');

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.value = {
      jevKey: env.TYPESAFE_API_KEY?.trim() ?? '',
      jevModel: modelName.parse(env.JEV_MODEL ?? 'jev-latest'),
      llmApiKey: env.LLM_API_KEY?.trim() ?? '',
      llmBaseUrl: normalizeBaseUrl(env.LLM_BASE_URL?.trim() ?? ''),
      llmModel: modelName.or(z.literal('')).parse(env.LLM_MODEL ?? ''),
    };
  }

  snapshot(): ProviderConfig { return structuredClone(this.value); }

  public(): PublicConfig {
    return {
      csrfToken: this.csrfToken,
      jevConfigured: Boolean(this.value.jevKey),
      llmConfigured: Boolean(this.value.llmApiKey && this.value.llmBaseUrl && this.value.llmModel),
      llmBaseUrl: this.value.llmBaseUrl,
      llmModel: this.value.llmModel,
      jevModel: this.value.jevModel,
    };
  }

  update(input: ConfigUpdate): PublicConfig {
    const patch = configSchema.parse(input);
    const next = { ...this.value };
    if (patch.clearKeys) {
      next.jevKey = '';
      next.llmApiKey = '';
    }
    if (patch.jevKey) next.jevKey = patch.jevKey;
    if (patch.jevModel) next.jevModel = patch.jevModel;
    if (patch.llmApiKey) next.llmApiKey = patch.llmApiKey;
    if (patch.llmBaseUrl !== undefined) next.llmBaseUrl = normalizeBaseUrl(patch.llmBaseUrl);
    if (patch.llmModel !== undefined) next.llmModel = patch.llmModel;
    this.value = next;
    return this.public();
  }
}

export function requireConfigured(options: RunOptions, config: ProviderConfig): void {
  if (options.mode === 'demo') return;
  if (options.arms.some(arm => arm !== 'llm') && !config.jevKey) {
    throw new LabError('Jev is not configured. Add a Jev API key in Connections or select only the LLM arm.');
  }
  if (options.arms.some(arm => arm !== 'jev') && (!config.llmApiKey || !config.llmBaseUrl || !config.llmModel)) {
    throw new LabError('The LLM is not configured. Add an OpenAI-compatible base URL, API key, and model in Connections, or select only the Jev arm.');
  }
}
