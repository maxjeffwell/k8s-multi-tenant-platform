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
      </div>
    </nav>
  );
}

export default Navigation;
