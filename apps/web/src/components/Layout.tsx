import { NavLink, Outlet } from 'react-router-dom';
import { getToken } from '../lib/api.js';
import { EyeGlyph } from './EyeGlyph.js';

const NAV = [
  { to: '/features', label: 'Features' },
  { to: '/test-cases', label: 'Test Cases' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const hasToken = Boolean(getToken());

  return (
    <div className="shell">
      <header className="topbar">
        {/* The mark is the eye itself — no separate logo lockup. */}
        <NavLink to="/features" className="mark">
          <EyeGlyph state="idle" size={22} />
          <span className="mark__word">Watcher</span>
        </NavLink>

        <nav className="topbar__nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="navlink">
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {!hasToken && (
        <div className="notice-strip">
          Add your access token on <NavLink to="/settings">Settings</NavLink> to start reading what the Watcher has
          recorded.
        </div>
      )}

      <main className="canvas">
        <Outlet />
      </main>
    </div>
  );
}
