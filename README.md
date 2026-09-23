# Jev vs LLM Benchmark

A provider-agnostic, local-first benchmark for comparing **Jev**, a **general-purpose LLM**, and a **confidence-gated hybrid** on the same fixed-choice decisions.

Measure accuracy, macro F1, p50/p95 latency, token usage, routing, failures, and case-level evidence. Choose the tasks, arms, repetitions, seed, and hybrid confidence gate from the dashboard.

This repository contains only the benchmark. It does **not** include an LLM-to-Jev conversion utility.

## What you can compare

- **General LLM:** any OpenAI-compatible Chat Completions endpoint supporting strict JSON-schema structured output.
- **Jev:** the TypeSafe Jev Choice API.
- **Hybrid:** Jev first, then the configured LLM when Jev confidence is below the selected gate.

The built-in dataset contains 18 labelled cases across support routing, incident priority, and request intent. Synthetic fixtures demonstrate the interface but are never presented as measured provider performance.

## Run locally

Requires Node.js 22.12+.

```powershell
git clone https://github.com/AkashAi7/jev-vs-llm-benchmark.git
cd jev-vs-llm-benchmark
npm install
Copy-Item .env.example .env
npm run dev
```

Open **http://127.0.0.1:4317**.

## Configure providers

Edit the ignored `.env` file or use the local Connections page:

```dotenv
TYPESAFE_API_KEY=
JEV_MODEL=jev-latest

# OpenAI-compatible endpoint
LLM_BASE_URL=https://api.openai.com/v1/
LLM_API_KEY=
LLM_MODEL=
```

Remote LLM endpoints must use HTTPS. Loopback HTTP is allowed for local OpenAI-compatible servers such as `http://127.0.0.1:8000/v1/`.

The selected LLM must support:

- `POST /chat/completions`
- strict JSON-schema response format
- the configured model identifier

Run one connectivity request before a full benchmark:

```powershell
npm run check:llm
```

## Validate

```powershell
npm test
npm run typecheck
npm run build
npm start
```

The production server listens on IPv4 loopback only. Provider keys are held in server memory, excluded from exports, and never returned to the browser. `.env`, local run history, dependencies, and build output are ignored by Git.

## Infographics

- [Runnable Jev vs LLM benchmark](deliverables/jev-vs-llm-runnable-benchmark.png) ([SVG](deliverables/jev-vs-llm-runnable-benchmark.svg))
- [General Jev vs LLM task-fit guide](deliverables/jev-vs-llm-general.png) ([SVG](deliverables/jev-vs-llm-general.svg))

## Interpreting results

This is a small decision benchmark, not a universal model leaderboard. Re-test with representative held-out cases and multiple runs before drawing production conclusions. A closed taxonomy must include an `other`, abstain, or escalation path when inputs can fall outside the declared choices.
