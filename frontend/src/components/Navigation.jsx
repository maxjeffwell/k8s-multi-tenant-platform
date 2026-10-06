import { NavLink } from 'react-router-dom';
import '../styles/Navigation.css';

function Navigation() {
  return (
    <nav className="navigation">
      <div className="nav-brand">
        <h2>TenantFlow: A Multi-Tenant Platform</h2>
      </div>
      <div className="nav-links">
        <NavLink
          to="/"
          className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
          end
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/analytics"
          className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
        >
          Analytics
        </NavLink>
        {/* Basic-auth logout: /logout is a Traefik route that always answers 401 for the admin
            realm, so the browser forgets the cached credential. Plain <a>: must hit the edge. */}
        <a href="/logout" className="nav-link" title="Forget the admin login in this browser">
          Logout
        </a>
      </div>
    </nav>
  );
}

export default Navigation;
