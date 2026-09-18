import { NavLink, Outlet } from 'react-router-dom';
import { getToken } from '../lib/api.js';

const NAV = [
  { to: '/features', label: 'Features' },
  { to: '/test-cases', label: 'Test Cases' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const hasToken = Boolean(getToken());

  return (
    <div className="app">
      <header className="nav">
        <span className="nav__brand">Repo Watcher</span>
        <nav className="nav__links">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav__link${isActive ? ' nav__link--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {!hasToken && (
        <div className="banner banner--warn">
          No API token set — the pages below will fail to load. Add it on <NavLink to="/settings">Settings</NavLink>.
        </div>
      )}

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
