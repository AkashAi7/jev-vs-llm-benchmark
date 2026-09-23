export const ARMS = ['llm', 'jev', 'hybrid'] as const;
export type Arm = typeof ARMS[number];
export const LLM_PROTOCOLS = ['openai-compatible', 'anthropic', 'gemini'] as const;
export type LlmProtocol = typeof LLM_PROTOCOLS[number];
export const ARM_LABELS: Record<Arm, string> = {
  llm: 'General LLM',
  jev: 'Jev',
  hybrid: 'LLM + Jev',
};

export interface Scenario {
  id: string;
  name: string;
  description: string;
  instructions: string;
  criteria: Record<string, string>;
}

export interface BenchmarkCase {
  id: string;
  scenarioId: string;
  title: string;
  input: string;
  expected: string;
  difficulty: 'standard' | 'edge';
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface Stage {
  provider: 'jev' | 'llm';
  model: string;
  latencyMs: number;
  choice: string;
  confidence: number | null;
  probabilities: Record<string, number> | null;
  usage: Usage | null;
}

export interface Observation {
  id: string;
  caseId: string;
  scenarioId: string;
  arm: Arm;
  repetition: number;
  expected: string;
  predicted: string | null;
  correct: boolean;
  status: 'success' | 'error';
  latencyMs: number;
  stages: Stage[];
  escalated: boolean;
  error: string | null;
}

export interface RunOptions {
  mode: 'demo' | 'live';
  arms: Arm[];
  scenarioIds: string[];
  repetitions: number;
  threshold: number;
  seed: number;
}

export interface BenchmarkRun {
  id: string;
  datasetVersion: string;
  datasetHash: string;
  dataset: { scenarios: Scenario[]; cases: BenchmarkCase[] };
  protocol: {
    version: string; stageTimeoutMs: number; maxCompletionTokens: number; retries: number;
    llmProtocol: LlmProtocol | null; llmBaseUrl: string;
  };
  createdAt: string;
  completedAt: string | null;
  status: 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
  options: RunOptions;
  total: number;
  observations: Observation[];
  models: { jev: string; llm: string };
  fatalError: string | null;
}

export interface MetricSummary {
  arm: Arm;
  total: number;
  successes: number;
  errors: number;
  accuracy: number | null;
  macroF1: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  meanMs: number | null;
  inputTokens: number;
  outputTokens: number;
  usageKnown: boolean;
  escalated: number;
  llmCalls: number;
}

export interface PublicConfig {
  csrfToken: string;
  jevConfigured: boolean;
  llmConfigured: boolean;
  llmProtocol: LlmProtocol;
  llmBaseUrl: string;
  llmModel: string;
  jevModel: string;
}

export interface ConfigUpdate {
  jevKey?: string;
  llmApiKey?: string;
  llmProtocol?: LlmProtocol;
  llmBaseUrl?: string;
  llmModel?: string;
  jevModel?: string;
  clearKeys?: boolean;
}

export interface Bootstrap {
  config: PublicConfig;
  scenarios: Scenario[];
  cases: BenchmarkCase[];
  runs: BenchmarkRun[];
}
