import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cases, scenarios } from '../shared/scenarios';
import { percentile, summarize } from '../shared/metrics';
import type { Observation, RunOptions, Stage } from '../shared/types';
import { Configuration, configSchema, normalizeBaseUrl, requireConfigured } from '../server/config';
import { demoProviders, shuffled } from '../server/demo';
import { LabError, safeError } from '../server/errors';
import { evaluate } from '../server/pipeline';
import { createProviders, llmMessages, validateLLM, validateJev, type Providers } from '../server/providers';
import { schedule } from '../server/runner';

const item = cases[0]!;
const scenario = scenarios[0]!;
const signal = new AbortController().signal;
const options: RunOptions = {
  mode: 'live', arms: ['llm', 'jev', 'hybrid'], scenarioIds: scenarios.map(s => s.id),
  repetitions: 1, threshold: 0.8, seed: 42,
};
const stage: Stage = {
  provider: 'jev', model: 'test-model', latencyMs: 10, choice: 'billing', confidence: 0.8,
  probabilities: { billing: 0.8, technical: 0.1, sales: 0.1 }, usage: { inputTokens: 10, outputTokens: 2 },
};
const jevResponse = {
  model: 'jev-resolved', answers: { decision: {
    type: 'choice', choice: 'billing', confidence: 0.82,
    probabilities: { billing: 0.8, technical: 0.1, sales: 0.1 },
  } }, usage: { input_tokens: 10, output_tokens: 2 },
};

test('dataset has 18 unique valid cases and balanced support/priority labels', () => {
  assert.equal(cases.length, 18);
  assert.equal(new Set(cases.map(row => row.id)).size, 18);
  for (const rubric of scenarios) {
    const selected = cases.filter(row => row.scenarioId === rubric.id);
    assert.equal(selected.length, 6);
    assert.equal(selected.filter(row => row.difficulty === 'edge').length, 3);
    for (const row of selected) assert.ok(Object.hasOwn(rubric.criteria, row.expected));
  }
});

test('schedule is deterministic, shuffled, complete and independently evaluates each arm', () => {
  const jobs = schedule({ ...options, repetitions: 2 });
  assert.equal(jobs.length, 108);
  assert.deepEqual(jobs, schedule({ ...options, repetitions: 2 }));
  assert.notDeepEqual(jobs, schedule({ ...options, repetitions: 2, seed: 43 }));
  assert.equal(new Set(jobs.map(job => `${job.item.id}-${job.arm}-${job.repetition}`)).size, 108);
  const input = [1, 2, 3, 4, 5];
  shuffled(input, 1);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
});

test('confidence equality accepts Jev; low confidence invokes LLM and counts both stages', async () => {
  let jevCalls = 0;
  let llmCalls = 0;
  const providers: Providers = {
    async jev() { jevCalls++; return stage; },
    async llm(actualItem, actualScenario, _, evidence) {
      llmCalls++;
      assert.equal(actualItem.input, item.input);
      assert.equal(actualScenario.instructions, scenario.instructions);
      assert.equal(evidence?.confidence, 0.8);
      return { ...stage, provider: 'llm', confidence: null };
    },
  };
  const accepted = await evaluate(item, scenario, 'hybrid', 1, options, providers, signal);
  assert.equal(accepted.escalated, false);
  assert.equal(accepted.correct, true);
  assert.equal(llmCalls, 0);
  await evaluate(item, scenario, 'jev', 1, options, providers, signal);
  const escalated = await evaluate(item, scenario, 'hybrid', 1, { ...options, threshold: 0.81 }, providers, signal);
  assert.equal(jevCalls, 3, 'hybrid must perform its own Jev call');
  assert.equal(escalated.stages.length, 2);
  assert.equal(escalated.escalated, true);
  assert.equal(llmCalls, 1);
  const metrics = summarize([escalated], 'hybrid', scenarios);
  assert.equal(metrics.inputTokens, 20);
  assert.equal(metrics.outputTokens, 4);
  assert.equal(metrics.llmCalls, 1);
});

test('failed escalation is an error and preserves completed Jev usage', async () => {
  const providers: Providers = {
    async jev() { return { ...stage, confidence: 0.5 }; },
    async llm() { throw Object.assign(new Error('secret upstream body'), { status: 429 }); },
  };
  const row = await evaluate(item, scenario, 'hybrid', 1, options, providers, signal);
  assert.equal(row.status, 'error');
  assert.equal(row.correct, false);
  assert.equal(row.predicted, null);
  assert.equal(row.escalated, true);
  assert.equal(row.stages.length, 1);
  assert.match(row.error!, /quota/);
  assert.ok(!JSON.stringify(row).includes('secret upstream body'));
  const metrics = summarize([row], 'hybrid', scenarios);
  assert.equal(metrics.accuracy, 0);
  assert.equal(metrics.p50Ms, null);
  assert.equal(metrics.inputTokens, 10);
  assert.equal(metrics.usageKnown, false);
  assert.equal(metrics.llmCalls, 0);
});

test('cancellation terminates even a provider ignoring AbortSignal without making a fake result', async () => {
  const controller = new AbortController();
  const providers: Providers = {
    jev: () => new Promise(() => {}),
    llm: () => new Promise(() => {}),
  };
  const pending = evaluate(item, scenario, 'jev', 1, options, providers, controller.signal);
  controller.abort();
  await assert.rejects(pending, /abort/i);
});

test('metrics include errors in accuracy/F1 and exclude them from success latency', () => {
  const base: Observation = {
    id: 'one', caseId: item.id, scenarioId: scenario.id, arm: 'jev', repetition: 1,
    expected: 'billing', predicted: 'billing', correct: true, status: 'success',
    latencyMs: 10, stages: [stage], escalated: false, error: null,
  };
  const rows: Observation[] = [
    base,
    { ...base, id: 'two', expected: 'technical', predicted: 'billing', correct: false, latencyMs: 30 },
    { ...base, id: 'three', expected: 'sales', predicted: null, correct: false, status: 'error', latencyMs: 999, stages: [], error: 'failed' },
  ];
  const result = summarize(rows, 'jev', scenarios);
  assert.equal(result.accuracy, 1 / 3);
  assert.equal(result.macroF1, (2 / 3) / 3);
  assert.equal(result.p50Ms, 20);
  assert.equal(result.p95Ms, 29);
  assert.equal(result.errors, 1);
  assert.equal(result.usageKnown, false);
  assert.equal(summarize([], 'jev', scenarios).accuracy, null);
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([5], 0.95), 5);
});

test('demo is deterministic and unmistakeably synthetic', async () => {
  const demoOptions = { ...options, mode: 'demo' as const };
  const a = await evaluate(item, scenario, 'hybrid', 1, demoOptions, demoProviders(42, 1), signal);
  const b = await evaluate(item, scenario, 'hybrid', 1, demoOptions, demoProviders(42, 1), signal);
  assert.deepEqual(a, b);
  assert.ok(a.stages.every(value => value.model.startsWith('synthetic-')));
  assert.equal(a.latencyMs, a.stages.reduce((total, value) => total + value.latencyMs, 0));
});

test('LLM base URL accepts remote HTTPS and loopback HTTP only', () => {
  assert.equal(normalizeBaseUrl('https://api.example.com/v1'), 'https://api.example.com/v1/');
  assert.equal(normalizeBaseUrl('http://127.0.0.1:8000/v1/'), 'http://127.0.0.1:8000/v1/');
  for (const endpoint of [
    'http://api.example.com/v1', 'not-a-url',
    'https://api.example.com/v1?key=x', 'https://user:pass@api.example.com/v1',
  ]) assert.throws(() => normalizeBaseUrl(endpoint), LabError);
});

test('configuration never exposes keys and invalid updates are atomic', () => {
  const config = new Configuration({});
  config.update({
    jevKey: 'not-a-real-jev-key', llmApiKey: 'not-a-real-llm-key',
    llmBaseUrl: 'https://api.example.com/v1', llmModel: 'example/model',
  });
  assert.equal(config.public().jevConfigured, true);
  assert.equal(config.public().llmConfigured, true);
  assert.ok(!JSON.stringify(config.public()).includes('not-a-real'));
  assert.throws(() => config.update({ clearKeys: true, llmBaseUrl: 'http://unsafe.test' }));
  assert.equal(config.public().jevConfigured, true);
  config.update({ clearKeys: true });
  assert.equal(config.public().jevConfigured, false);
  assert.equal(config.public().llmConfigured, false);
  assert.equal(safeError(new Error('credential contents')), 'Provider operation failed. Check connectivity, endpoint compatibility, and credentials. Raw error details are withheld.');
});

test('LLM requires explicit base URL, key, and model', () => {
  const env = {
    TYPESAFE_API_KEY: 'test-jev', LLM_BASE_URL: 'https://api.example.com/v1',
    LLM_API_KEY: 'test-llm-key', LLM_MODEL: 'test-model',
  };
  for (const missing of ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL']) {
    const config = new Configuration({ ...env, [missing]: '' });
    assert.equal(config.public().llmConfigured, false);
    assert.throws(() => requireConfigured({ ...options, mode: 'live' }, config.snapshot()), /not configured/);
    assert.doesNotThrow(() => requireConfigured({ ...options, mode: 'live', arms: ['jev'] }, config.snapshot()));
  }
  const complete = new Configuration(env);
  assert.equal(complete.public().llmConfigured, true);
  assert.doesNotThrow(() => requireConfigured({ ...options, mode: 'live' }, complete.snapshot()));
  assert.ok(!JSON.stringify(complete.public()).includes('test-llm-key'));
  assert.throws(() => configSchema.parse({ providerSpecificAuth: 'rejected' }));
  complete.update({ clearKeys: true });
  assert.equal(complete.public().llmConfigured, false);
  const snapshot = complete.snapshot();
  snapshot.llmApiKey = 'mutated';
  assert.equal(complete.snapshot().llmApiKey, '');
});
test('provider output validation fails closed', () => {
  assert.equal(validateJev(jevResponse, scenario, 1).confidence, 0.82);
  assert.throws(() => validateJev({ ...jevResponse, answers: { decision: { ...jevResponse.answers.decision, confidence: 1.2 } } }, scenario, 1));
  assert.throws(() => validateJev({ ...jevResponse, answers: { decision: { ...jevResponse.answers.decision, probabilities: { billing: 0.8 } } } }, scenario, 1));
  assert.throws(() => validateJev({ ...jevResponse, answers: { decision: { ...jevResponse.answers.decision, choice: 'wrong' } } }, scenario, 1));
  assert.equal(validateLLM('{"choice":"billing"}', scenario), 'billing');
  for (const content of [null, 'not-json', '{"choice":"wrong"}', '{"choice":"billing","reason":"extra"}']) {
    assert.throws(() => validateLLM(content, scenario));
  }
});

test('ground truth and case metadata never reach LLM messages', () => {
  const marker = 'GROUND_TRUTH_MUST_STAY_LOCAL';
  const input = { ...item, expected: marker, title: marker, id: marker };
  assert.ok(!JSON.stringify(llmMessages(input, scenario)).includes(marker));
  assert.ok(!JSON.stringify(llmMessages(input, scenario, stage)).includes(marker));
});

test('SDK output guards reject refusals, truncation and invalid usage; missing usage remains unknown', async () => {
  const completion = {
    id: 'completion-test', object: 'chat.completion', created: 1, model: 'llm-resolved',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"choice":"billing"}', refusal: null } }],
  };
  let response: unknown = completion;
  const providers = createProviders({
    jevKey: '', jevModel: 'jev-latest', llmApiKey: 'test-only',
    llmBaseUrl: 'https://api.example.com/v1/', llmModel: 'test',
  }, async () => Response.json(response));
  assert.equal((await providers.llm(item, scenario, signal)).usage, null);
  const { usage: _usage, ...withoutUsage } = jevResponse;
  assert.equal(validateJev(withoutUsage, scenario, 1).usage, null);
  for (const invalid of [
    { ...completion, choices: [] },
    { ...completion, choices: [{ ...completion.choices[0], finish_reason: 'length' }] },
    { ...completion, choices: [{ ...completion.choices[0], message: { ...completion.choices[0]!.message, refusal: 'not allowed' } }] },
    { ...completion, model: '' },
    { ...completion, usage: { prompt_tokens: -1, completion_tokens: 3 } },
    { ...completion, usage: { prompt_tokens: 3 } },
  ]) {
    response = invalid;
    await assert.rejects(() => providers.llm(item, scenario, signal), LabError);
  }
});

test('real SDK adapters send correct payloads with no retries or redirects using mock HTTP', async () => {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.startsWith('https://api.typesafe.ai/')) {
      return Response.json(jevResponse);
    }
    return Response.json({
      id: 'completion-test', object: 'chat.completion', created: 1, model: 'llm-resolved',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"choice":"billing"}', refusal: null } }],
      usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 },
    });
  };
  const providers = createProviders({
    jevKey: 'test-only-jev-key', jevModel: 'jev-latest', llmApiKey: 'test-only-llm-key',
    llmBaseUrl: 'https://api.example.com/v1/', llmModel: 'model-test',
  }, transport);
  const sentItem = { ...item, expected: 'SECRET_EXPECTATION', title: 'SECRET_TITLE' };
  const jev = await providers.jev(sentItem, scenario, signal);
  const llm = await providers.llm(sentItem, scenario, signal);
  assert.equal(jev.model, 'jev-resolved');
  assert.equal(llm.model, 'llm-resolved');
  assert.deepEqual(llm.usage, { inputTokens: 20, outputTokens: 3 });
  assert.equal(requests.length, 2);
  assert.equal(requests[0]!.url, 'https://api.typesafe.ai/v1/systemone');
  assert.ok(requests[0]!.headers.get('authorization')?.includes('test-only-jev-key'), 'SDK sends the configured credential');
  assert.equal(requests[1]!.url, 'https://api.example.com/v1/chat/completions');
  assert.equal(requests[1]!.headers.get('authorization'), 'Bearer test-only-llm-key');
  assert.equal(requests[1]!.headers.has('api-key'), false);
  for (const request of requests) {
    assert.equal(request.redirect, 'error');
    const body = await request.text();
    assert.ok(!body.includes('SECRET_'));
    assert.ok(body.includes(item.input));
  }
  let failures = 0;
  const failing = createProviders({
    jevKey: 'test', jevModel: 'jev-latest', llmApiKey: 'test',
    llmBaseUrl: 'https://api.example.com/v1/', llmModel: 'test',
  }, async () => { failures++; return Response.json({ error: { message: 'test' } }, { status: 429 }); });
  await assert.rejects(() => failing.jev(item, scenario, signal));
  await assert.rejects(() => failing.llm(item, scenario, signal));
  assert.equal(failures, 2, 'each failed call must make exactly one attempt');
});
