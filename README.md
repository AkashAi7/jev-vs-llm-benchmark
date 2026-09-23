# Jev vs LLM Benchmark

A provider-agnostic, local-first benchmark for comparing **Jev**, a **general-purpose LLM**, and a **confidence-gated hybrid** on the same fixed-choice decisions.

Measure accuracy, macro F1, p50/p95 latency, token usage, routing, failures, and case-level evidence. Choose the tasks, arms, repetitions, seed, and hybrid confidence gate from the dashboard.

This repository contains only the benchmark. It does **not** include an LLM-to-Jev conversion utility.

## What you can compare

- **General LLM:** OpenAI-compatible, Anthropic, or Google Gemini APIs through native protocol adapters.
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

# openai-compatible, anthropic, or gemini
LLM_PROTOCOL=openai-compatible
LLM_BASE_URL=https://api.openai.com/v1/
LLM_API_KEY=
LLM_MODEL=
```

Supported protocols:

| `LLM_PROTOCOL` | API used | Default base URL |
|---|---|---|
| `openai-compatible` | Chat Completions with strict JSON schema | `https://api.openai.com/v1/` |
| `anthropic` | Messages API with a forced decision tool | `https://api.anthropic.com/v1/` |
| `gemini` | `generateContent` with a response JSON schema | `https://generativelanguage.googleapis.com/v1beta/` |

OpenAI-compatible mode also supports local servers such as vLLM, Ollama-compatible gateways, LM Studio, and other implementations that expose the required Chat Completions structured-output contract. Remote endpoints must use HTTPS; loopback HTTP is allowed.

Each adapter converts the same benchmark prompt and decision schema into the provider's native request, then normalizes model name, decision, token usage, and errors into one result format. This keeps the benchmark arm stable while allowing different providers and API families.

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
