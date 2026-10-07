import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState, PageHeader, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { adminService } from '../../services/adminService';
import { formatDate } from '../../utils/formatters';

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const query = useApi(() => adminService.getAuditLogs({ page, limit: 25, search }), [page, search]);
  const data = query.data;
  return (
    <>
      <PageHeader eyebrow="GOVERNANCE" title="Audit log" description="Review administrative and security activity. Sensitive credentials are excluded from audit metadata." />
      <Card>
        <form className="list-toolbar" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
          <div className="search-field"><Search size={16} /><input aria-label="Search audit events" placeholder="Search actions or resources" value={searchInput} onChange={event => setSearchInput(event.target.value)} /></div>
          <Button type="submit" variant="secondary">Search log</Button>
        </form>
        <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
        {data && (data.logs.length === 0 ? <EmptyState title="No audit events found" detail="Try a different search term or check back after more activity." /> : (
          <div className="table-card"><div className="table-scroll"><table>
            <thead><tr><th>Event</th><th>Actor</th><th>Resource</th><th>Date</th></tr></thead>
            <tbody>{data.logs.map((item, index) => <tr key={item.id || `${item.action}-${index}`}>
              <td><strong>{item.action.replace(/_/g, ' ')}</strong><br /><span className="muted">{item.details}</span></td>
              <td>{item.actor}</td><td>{item.entity || '—'}{item.entityId ? <small className="muted"> · {item.entityId}</small> : ''}</td><td>{formatDate(item.createdAt)}</td>
            </tr>)}</tbody>
          </table></div></div>
        ))}
        {data && <div className="list-toolbar"><span className="muted">{data.total} events</span><div className="toolbar-filters">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
          <span className="muted">Page {page} of {Math.max(1, Math.ceil(data.total / data.limit))}</span>
          <Button variant="secondary" disabled={page >= Math.ceil(data.total / data.limit)} onClick={() => setPage(value => value + 1)}>Next</Button>
        </div></div>}
      </Card>
    </>
  );
}
