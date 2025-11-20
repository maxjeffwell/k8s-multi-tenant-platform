import { useState } from 'react';
import TenantCard from './TenantCard';

function TenantList({ tenants, onTenantDeleted }) {
  const [expandedTenant, setExpandedTenant] = useState(null);

  if (tenants.length === 0) {
    return (
      <div className="empty-state">
        <h3>No tenants yet</h3>
        <p>Create your first tenant to get started</p>
      </div>
    );
  }

  return (
    <div className="tenant-list">
      <h2>Active Tenants ({tenants.length})</h2>
      <div className="tenant-grid">
        {tenants.map((tenant) => (
          <TenantCard
            key={tenant.name}
            tenant={tenant}
            isExpanded={expandedTenant === tenant.name}
            onToggle={() =>
              setExpandedTenant(expandedTenant === tenant.name ? null : tenant.name)
            }
            onDeleted={onTenantDeleted}
          />
        ))}
      </div>
    </div>
  );
}

export default TenantList;
