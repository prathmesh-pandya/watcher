import { useState, type FormEvent } from 'react';
import { REPO_TYPES, type RepoType } from '@watcher/shared';
import { api, getToken, setToken } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { EmptyState, ErrorState, Loading } from '../components/States.js';
import { EyeGlyph, type EyeState } from '../components/EyeGlyph.js';

type Feedback = { kind: 'ok' | 'bad'; message: string } | null;

export function SettingsPage() {
  const [token, setTokenState] = useState(getToken());
  const [tokenFeedback, setTokenFeedback] = useState<Feedback>(null);

  const repos = useApi(() => api.listRepos(), []);
  const cases = useApi(() => api.listTestCases(), []);

  const [form, setForm] = useState({
    repoUrl: '',
    targetBranch: 'main',
    type: 'frontend' as RepoType,
    webhookSecret: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [repoFeedback, setRepoFeedback] = useState<Feedback>(null);

  function eyeStateFor(fullName: string): EyeState {
    const mine = (cases.data?.items ?? []).filter((c) => c.repoFullName === fullName);
    if (mine.some((c) => c.status === 'new')) return 'attention';
    if (mine.some((c) => c.status === 'in_progress')) return 'working';
    return 'idle';
  }

  async function saveToken(e: FormEvent) {
    e.preventDefault();
    const trimmed = token.trim();
    setToken(trimmed);
    setTokenFeedback(null);

    if (!trimmed) {
      setTokenFeedback({ kind: 'bad', message: 'Token cleared. The pages below will stop loading.' });
      repos.reload();
      return;
    }

    // Prove the token works instead of just claiming it was saved.
    try {
      await api.listRepos();
      setTokenFeedback({ kind: 'ok', message: 'Token saved and accepted.' });
      repos.reload();
      cases.reload();
    } catch (err) {
      setTokenFeedback({ kind: 'bad', message: `Saved, but the server rejected it. ${(err as Error).message}` });
    }
  }

  async function addRepo(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setRepoFeedback(null);
    try {
      const created = await api.createRepo({
        repoUrl: form.repoUrl.trim(),
        targetBranch: form.targetBranch.trim(),
        type: form.type,
        webhookSecret: form.webhookSecret.trim() || undefined,
      });
      setForm({ repoUrl: '', targetBranch: 'main', type: 'frontend', webhookSecret: '' });
      setRepoFeedback({
        kind: 'ok',
        message: `Now watching ${created.fullName} on ${created.targetBranch}. Point a GitHub webhook at /webhooks/github to start receiving pushes.`,
      });
      repos.reload();
    } catch (err) {
      setRepoFeedback({ kind: 'bad', message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  async function stopWatching(id: string, fullName: string) {
    if (!window.confirm(`Stop watching ${fullName}? Its documentation and test cases stay in the database.`)) return;
    setRepoFeedback(null);
    try {
      await api.deleteRepo(id);
      setRepoFeedback({ kind: 'ok', message: `Stopped watching ${fullName}.` });
      repos.reload();
    } catch (err) {
      setRepoFeedback({ kind: 'bad', message: (err as Error).message });
    }
  }

  const items = repos.data?.items ?? [];

  return (
    <div>
      <div className="head">
        <h1>Settings</h1>
        <p>Your access token, and the repositories the Watcher follows.</p>
      </div>

      <section className="section">
        <h2>Access token</h2>
        <p className="section__intro">
          This has to match the token the server was started with. It stays in this browser only.
        </p>
        <form className="form form--row" onSubmit={saveToken}>
          <label style={{ flex: 1 }}>
            Token
            <input
              type="password"
              value={token}
              placeholder="paste your token"
              onChange={(e) => {
                setTokenState(e.target.value);
                setTokenFeedback(null);
              }}
            />
          </label>
          <button type="submit" className="btn">
            Save token
          </button>
        </form>
        {tokenFeedback && (
          <p className={`feedback feedback--${tokenFeedback.kind === 'ok' ? 'ok' : 'bad'}`} style={{ marginTop: 14 }}>
            {tokenFeedback.message}
          </p>
        )}
      </section>

      <section className="section">
        <h2>Watched repositories</h2>
        <p className="section__intro">Every push to the branch you name is read and documented.</p>

        {repos.loading && <Loading what="your repositories" />}
        {repos.error && <ErrorState message={repos.error} onRetry={repos.reload} />}

        {!repos.loading && !repos.error && items.length === 0 && (
          <EmptyState title="Not watching anything yet">
            <p>Add a repo below to start watching. The Watcher reads every push to the branch you name.</p>
          </EmptyState>
        )}

        {!repos.loading && !repos.error && items.length > 0 && (
          <ul className="roster">
            {items.map((r) => (
              <li key={r.id}>
                <EyeGlyph state={eyeStateFor(r.fullName)} size={18} />
                <div className="roster__name">
                  <a href={r.repoUrl} target="_blank" rel="noreferrer">
                    {r.fullName}
                  </a>
                  <span className="roster__sub">
                    watching <span className="data">{r.targetBranch}</span> — {r.type}
                    {r.enabled ? '' : ' — paused'}
                  </span>
                </div>
                <button type="button" className="btn btn--quiet" onClick={() => stopWatching(r.id, r.fullName)}>
                  Stop watching
                </button>
              </li>
            ))}
          </ul>
        )}

        {repoFeedback && (
          <p className={`feedback feedback--${repoFeedback.kind === 'ok' ? 'ok' : 'bad'}`} style={{ marginTop: 16 }}>
            {repoFeedback.message}
          </p>
        )}
      </section>

      <section className="section">
        <h2>Watch a new repository</h2>
        <form className="form" onSubmit={addRepo}>
          <label>
            Repository URL
            <input
              required
              value={form.repoUrl}
              placeholder="https://github.com/your-org/your-repo"
              onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
            />
          </label>
          <label>
            Branch to watch
            <input
              required
              value={form.targetBranch}
              onChange={(e) => setForm({ ...form, targetBranch: e.target.value })}
            />
          </label>
          <label>
            Kind of repo
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as RepoType })}>
              {REPO_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Webhook secret
            <input
              type="password"
              value={form.webhookSecret}
              placeholder="leave blank to use the server's"
              onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
            />
            <span className="hint">Has to match the secret you type into GitHub's webhook form.</span>
          </label>

          <button type="submit" className="btn btn--primary" disabled={submitting} style={{ alignSelf: 'flex-start' }}>
            {submitting ? 'Adding…' : 'Start watching'}
          </button>
        </form>
      </section>
    </div>
  );
}
