import { useState } from 'react';
import Notice from '../components/Notice.jsx';
import BrandMark from '../components/BrandMark.jsx';

export default function LockPage({ lock }) {
  const [password, setPassword] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (password) lock.unlock(password);
  };

  return (
    <>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Excel to Zoho ERP home">
          <BrandMark className="brand-mark" />
          <span>Excel <b>to</b> Zoho ERP</span>
        </a>
      </header>

      <main className="home-page">
        <section className="lock-page">
          <form className="home-connect-card" onSubmit={submit}>
            <div className="home-connect-heading">
              <span className="home-connect-icon" aria-hidden="true">🔒</span>
              <span><strong>Enter app password</strong><small>This workspace is protected. Ask your admin for the password.</small></span>
            </div>
            <Notice notice={lock.error && { type: 'error', text: lock.error }} />
            <label className="field">
              <span>Password</span>
              <input type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <div className="card-actions">
              <button className="primary-button" type="submit" disabled={lock.busy || !password}>
                {lock.busy ? 'Checking…' : 'Unlock'}
              </button>
            </div>
          </form>
        </section>
      </main>
    </>
  );
}
