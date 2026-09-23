import { useState } from 'react';
import { Check, KeyRound, LockKeyhole, Plug, Save, ShieldCheck } from 'lucide-react';
import type { ConfigUpdate, PublicConfig } from '../../shared/types';
import { errorMessage } from '../lib/api';
import { ErrorNotice } from './Status';

export function Connections({ config, save }: { config: PublicConfig; save: (update: ConfigUpdate) => Promise<void> }) {
  const [baseUrl, setBaseUrl] = useState(config.llmBaseUrl);
  const [llmModel, setLlmModel] = useState(config.llmModel);
  const [llmApiKey, setLlmApiKey] = useState('');
  const [jevModel, setJevModel] = useState(config.jevModel);
  const [jevKey, setJevKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const submit = async (clearKeys = false) => {
    const update: ConfigUpdate = clearKeys ? { clearKeys: true } : {
      llmBaseUrl: baseUrl.trim(),
      llmModel: llmModel.trim(),
      jevModel: jevModel.trim(),
      ...(llmApiKey.trim() ? { llmApiKey: llmApiKey.trim() } : {}),
      ...(jevKey.trim() ? { jevKey: jevKey.trim() } : {}),
    };
    setLlmApiKey('');
    setJevKey('');
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await save(update);
      setMessage(clearKeys ? 'Session API keys cleared. Environment credentials are unchanged.' : 'Connection settings saved. No provider request was sent.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  };

  return <div className="connections-layout">
    <div>
      <section className="panel connections-form" aria-labelledby="providers-title">
        <div className="panel-heading"><div><span className="eyebrow">BRING YOUR OWN PROVIDERS</span><h2 id="providers-title">Provider connections</h2></div><Plug size={19} aria-hidden="true" /></div>
        <form onSubmit={event => { event.preventDefault(); void submit(); }}>
          <fieldset disabled={busy}><legend className="sr-only">Provider credentials and model settings</legend>
            <div className="provider-heading"><h3><span className="arm-dot llm" />General LLM</h3><span className={`config-status ${config.llmConfigured ? 'configured' : ''}`}>{config.llmConfigured ? 'Configured' : 'Not configured'}</span></div>
            <label>OpenAI-compatible base URL<input type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1/" autoComplete="url" aria-describedby="endpoint-help" /></label>
            <p id="endpoint-help" className="field-help">Remote endpoints require HTTPS. Loopback HTTP is allowed for local model servers.</p>
            <label>Model name<input type="text" value={llmModel} onChange={event => setLlmModel(event.target.value)}
              placeholder="Provider model identifier" autoComplete="off" /></label>
            <label>LLM API key<input type="password" value={llmApiKey} onChange={event => setLlmApiKey(event.target.value)}
              placeholder={config.llmConfigured ? 'Key is configured · enter to replace' : 'Enter provider API key'} autoComplete="new-password" spellCheck={false} /></label>
            <p className="field-help">The endpoint must support Chat Completions with strict JSON-schema structured output.</p>
            <div className="provider-divider" />
            <div className="provider-heading"><h3><span className="arm-dot jev" />Jev</h3><span className={`config-status ${config.jevConfigured ? 'configured' : ''}`}>{config.jevConfigured ? 'Configured' : 'Not configured'}</span></div>
            <label>Jev model<input type="text" value={jevModel} onChange={event => setJevModel(event.target.value)} autoComplete="off" required /></label>
            <label>Jev API key<input type="password" value={jevKey} onChange={event => setJevKey(event.target.value)}
              placeholder={config.jevConfigured ? 'Key is configured · enter to replace' : 'Enter your Jev API key'} autoComplete="new-password" spellCheck={false} /></label>
          </fieldset>
          {error && <ErrorNotice message={error} />}
          {message && <div className="success-notice" role="status"><Check size={17} aria-hidden="true" /><p>{message}</p></div>}
          <div className="connection-actions"><button type="submit" className="primary-button" disabled={busy}><Save size={16} aria-hidden="true" />{busy ? 'Saving…' : 'Save connections'}</button>
            <button type="button" className="text-button" disabled={busy} onClick={() => { void submit(true); }}><KeyRound size={15} aria-hidden="true" />Clear session keys</button></div>
          <p className="field-help"><LockKeyhole size={13} aria-hidden="true" />Keys clear from the fields on submit and are never stored in browser localStorage.</p>
        </form>
      </section>
    </div>
    <aside className="connection-guide">
      <section className="panel guide-section"><span className="eyebrow">PROVIDER-AGNOSTIC</span><h2>Use your LLM endpoint.</h2>
        <ol className="setup-steps">
          <li><span>1</span><div><h3>Choose a compatible provider</h3><p>Use any hosted or local endpoint implementing the OpenAI Chat Completions contract.</p></div></li>
          <li><span>2</span><div><h3>Enter URL, key, and model</h3><p>Use the provider's base URL and exact model identifier. Local servers can use a placeholder key if their API requires none.</p></div></li>
          <li><span>3</span><div><h3>Check structured output</h3><p>Run <code>npm run check:llm</code>. The selected model must support strict JSON-schema output.</p></div></li>
        </ol>
        <p className="guide-callout">Compatibility is capability-based, not vendor-based. A configured endpoint is not considered verified until a request succeeds.</p>
      </section>
      <section className="privacy-note"><ShieldCheck size={21} aria-hidden="true" /><div><h2>Keep credentials local.</h2><p>Submitted keys are held only in server process memory. Restarting clears session overrides.</p><p>If a key is exposed, revoke it with the provider. Never place keys in shared files, exports, or source control.</p></div></section>
      <p className="verification-note">A live benchmark makes real provider requests and may incur costs.</p>
    </aside>
  </div>;
}
