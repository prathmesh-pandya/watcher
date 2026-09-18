import { useState, type FormEvent } from 'react';
import { REPO_TYPES, type RepoType } from '@watcher/shared';
import { api, getToken, setToken } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { ErrorState, Loading } from '../components/States.js';

export function SettingsPage() {
  const [token, setTokenState] = useState(getToken());
  const [tokenSaved, setTokenSaved] = useState(false);

  const repos = useApi(() => api.listRepos(), []);

  const [form, setForm] = useState({
    repoUrl: '',
    targetBranch: 'main',
    type: 'frontend' as RepoType,
    webhookSecret: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function saveToken(e: FormEvent) {
    e.preventDefault();
    setToken(token.trim());
    setTokenSaved(true);
    repos.reload();
  }

  async function addRepo(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await api.createRepo({
        repoUrl: form.repoUrl.trim(),
        targetBranch: form.targetBranch.trim(),
        type: form.type,
        webhookSecret: form.webhookSecret.trim() || undefined,
      });
      setForm({ repoUrl: '', targetBranch: 'main', type: 'frontend', webhookSecret: '' });
      repos.reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function removeRepo(id: string, fullName: string) {
    if (!window.confirm(`Stop watching ${fullName}? Its docs and test cases stay in the database.`)) return;
    try {
      await api.deleteRepo(id);
      repos.reload();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Settings</h1>
        <p className="page__subtitle">Shared API token and the external repos this tool watches.</p>
      </div>

      <section className="card">
        <h2>API token</h2>
        <p className="muted">
          Must match <code>API_TOKEN</code> in the server's environment. Stored in this browser's localStorage.
        </p>
        <form className="form form--inline" onSubmit={saveToken}>
          <input
            type="password"
            value={token}
            placeholder="shared token"
            onChange={(e) => {
              setTokenState(e.target.value);
              setTokenSaved(false);
            }}
          />
          <button type="submit" className="btn btn--primary">
            Save
          </button>
          {tokenSaved && <span className="muted">Saved.</span>}
        </form>
      </section>

      <section className="card">
        <h2>Watched repositories</h2>
        <p className="muted">
          These are the external frontend/backend repos being monitored — not this app's own code.
        </p>

        {repos.loading && <Loading what="repos" />}
        {repos.error && <ErrorState message={repos.error} onRetry={repos.reload} />}

        {!repos.loading && !repos.error && (
          <table className="table">
            <thead>
              <tr>
                <th>Repo</th>
                <th>Branch</th>
                <th>Type</th>
                <th>Secret</th>
                <th>Enabled</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(repos.data?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No repos configured yet.
                  </td>
                </tr>
              )}
              {(repos.data?.items ?? []).map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={r.repoUrl} target="_blank" rel="noreferrer">
                      {r.fullName}
                    </a>
                  </td>
                  <td>
                    <code>{r.targetBranch}</code>
                  </td>
                  <td>{r.type}</td>
                  <td>{r.hasWebhookSecret ? 'per-repo' : 'env fallback'}</td>
                  <td>{r.enabled ? 'yes' : 'no'}</td>
                  <td>
                    <button type="button" className="btn btn--danger" onClick={() => removeRepo(r.id, r.fullName)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Add a repository</h2>
        <form className="form" onSubmit={addRepo}>
          <label>
            Repo URL
            <input
              required
              value={form.repoUrl}
              placeholder="https://github.com/acme/storefront-web"
              onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
            />
          </label>
          <label>
            Target branch
            <input
              required
              value={form.targetBranch}
              onChange={(e) => setForm({ ...form, targetBranch: e.target.value })}
            />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as RepoType })}>
              {REPO_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Webhook secret <span className="muted">(optional — falls back to GITHUB_WEBHOOK_SECRET)</span>
            <input
              type="password"
              value={form.webhookSecret}
              onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
            />
          </label>

          {formError && <p className="state state--error">{formError}</p>}

          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add repository'}
          </button>
        </form>
      </section>
    </div>
  );
}
