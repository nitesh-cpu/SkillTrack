import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { EmptyState, Notice, PageHeader, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { adminService } from '../../services/adminService';

const ROLES = ['student', 'mentor', 'admin'];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', role: '', isActive: '' });
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const [busyId, setBusyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const query = useApi(
    () => adminService.getUsers({ page, limit: 25, ...filters }),
    [page, filters.search, filters.role, filters.isActive],
  );
  const result = query.data;

  function applyFilters(event) {
    event.preventDefault();
    setPage(1);
    setFilters(previous => ({ ...previous, search: searchInput.trim() }));
  }

  async function updateUser(id, values, label) {
    setError('');
    setNotice('');
    setBusyId(id);
    try {
      await adminService.updateUser(id, values);
      setNotice(label);
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update this account.');
    } finally {
      setBusyId('');
    }
  }

  async function createUser(event) {
    event.preventDefault();
    setError('');
    if (form.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.password.length < 8) {
      setError('Enter a name, valid email, and initial password of at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await adminService.addUser({ ...form, name: form.name.trim(), email: form.email.trim() });
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'student' });
      setNotice('Account created successfully.');
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create this account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="PEOPLE & ACCESS"
        title="User management"
        description="Search accounts, manage platform roles, and control access."
        action={<Button onClick={() => { setError(''); setShowModal(true); }}><Plus size={16} /> Add user</Button>}
      />
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <Card>
        <form className="list-toolbar" onSubmit={applyFilters}>
          <div className="search-field">
            <Search size={16} />
            <input aria-label="Search users" placeholder="Name or email" value={searchInput} onChange={event => setSearchInput(event.target.value)} />
          </div>
          <div className="toolbar-filters">
            <select aria-label="Filter users by role" value={filters.role} onChange={event => { setPage(1); setFilters(previous => ({ ...previous, role: event.target.value })); }}>
              <option value="">Every role</option>
              {ROLES.map(role => <option key={role} value={role.toUpperCase()}>{role[0].toUpperCase() + role.slice(1)}s</option>)}
            </select>
            <select aria-label="Filter users by status" value={filters.isActive} onChange={event => { setPage(1); setFilters(previous => ({ ...previous, isActive: event.target.value })); }}>
              <option value="">Every status</option><option value="true">Active</option><option value="false">Disabled</option>
            </select>
            <Button type="submit" variant="secondary">Search</Button>
          </div>
        </form>
        <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
        {result && (
          <>
            {result.users.length === 0 ? <EmptyState title="No matching users" detail="Try changing the search or filters." /> : (
              <div className="table-card">
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Access</th></tr></thead>
                    <tbody>
                      {result.users.map(account => {
                        const isSelf = String(account.id) === String(currentUser?.id || currentUser?._id);
                        return (
                          <tr key={account.id}>
                            <td><strong>{account.name}</strong><br /><span className="muted">{account.email}</span>{isSelf && <span className="status-pill"> You</span>}</td>
                            <td>
                              <select aria-label={`Role for ${account.name}`} value={account.role} disabled={busyId === account.id || isSelf} onChange={event => {
                                const nextRole = event.target.value;
                                if (nextRole !== account.role && window.confirm(`Change ${account.name}'s role to ${nextRole}?`)) {
                                  updateUser(account.id, { role: nextRole }, 'User role updated.');
                                }
                              }}>
                                {ROLES.map(role => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}
                              </select>
                            </td>
                            <td><span className={`status-pill ${account.status === 'Active' ? 'status-verified' : 'status-pending'}`}>{account.status}</span></td>
                            <td><Button variant="secondary" busy={busyId === account.id} disabled={isSelf} onClick={() => {
                              const nextActive = account.status !== 'Active';
                              if (window.confirm(`${nextActive ? 'Activate' : 'Deactivate'} ${account.name}'s account?`)) {
                                updateUser(account.id, { isActive: nextActive }, `Account ${nextActive ? 'activated' : 'deactivated'}.`);
                              }
                            }}>{account.status === 'Active' ? 'Deactivate' : 'Activate'}</Button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="list-toolbar">
              <span className="muted">{result.pagination.total} accounts</span>
              <div className="toolbar-filters">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
                <span className="muted">Page {page} of {Math.max(1, result.pagination.pages)}</span>
                <Button variant="secondary" disabled={page >= result.pagination.pages} onClick={() => setPage(value => value + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Card>
      {showModal && (
        <Modal title="Create user account" onClose={() => setShowModal(false)} onSubmit={createUser} submitLabel="Create account" busy={busy}>
          <p className="muted">Share the initial password securely with the new user.</p>
          <label className="field-label">Full name<input required minLength={2} maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <label className="field-label">Email<input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
          <label className="field-label">Initial password<input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label>
          <label className="field-label">Role<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}>{ROLES.map(role => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}</select></label>
        </Modal>
      )}
    </>
  );
}
