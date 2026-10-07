import { useState } from 'react';
import { Edit3, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { EmptyState, Notice, PageHeader, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { adminService } from '../../services/adminService';

const EMPTY_FORM = { name: '', category: '', description: '' };

export default function SkillsPage() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const query = useApi(() => adminService.getSkills(), []);
  const skills = (query.data || []).filter(skill => `${skill.name} ${skill.category} ${skill.description}`.toLowerCase().includes(search.toLowerCase()));

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  }
  function openEdit(skill) {
    setEditing(skill);
    setForm({ name: skill.name, category: skill.category, description: skill.description || '' });
    setError('');
    setShowModal(true);
  }
  async function saveSkill(event) {
    event.preventDefault();
    setError('');
    if (!form.name.trim() || !form.category.trim()) {
      setError('Skill name and category are required.');
      return;
    }
    setBusy(true);
    try {
      if (editing) await adminService.updateSkill(editing.id, { ...form, name: form.name.trim(), category: form.category.trim(), description: form.description.trim() });
      else await adminService.addSkill({ ...form, name: form.name.trim(), category: form.category.trim(), description: form.description.trim() });
      setShowModal(false);
      setNotice(editing ? 'Skill details updated.' : 'Skill added to the catalog.');
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this skill.');
    } finally {
      setBusy(false);
    }
  }
  async function setActive(skill, isActive) {
    setError('');
    setNotice('');
    setBusyId(skill.id);
    try {
      if (isActive) await adminService.updateSkill(skill.id, { isActive: true });
      else await adminService.removeSkill(skill.id);
      setNotice(isActive ? 'Skill reactivated.' : 'Skill deactivated.');
      query.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update the skill.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <PageHeader eyebrow="LEARNING CATALOG" title="Skill management" description="Maintain the active skill catalog and its existing category metadata." action={<Button onClick={openCreate}><Plus size={16} /> Add skill</Button>} />
      {error && !showModal && <Notice kind="error">{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      <Card>
        <div className="list-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search skills" placeholder="Search skills and categories" value={search} onChange={event => setSearch(event.target.value)} /></div><span className="muted">{skills.length} skills</span></div>
        <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
        {query.data && (skills.length === 0 ? <EmptyState title="No skills found" detail="Try another search term or add a skill to the catalog." /> : (
          <div className="table-card"><div className="table-scroll"><table><thead><tr><th>Skill</th><th>Category</th><th>Students</th><th>Avg. score</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{skills.map(skill => <tr key={skill.id}>
              <td><strong>{skill.name}</strong>{skill.description && <><br /><span className="muted">{skill.description}</span></>}</td>
              <td>{skill.category}</td><td>{skill.activeStudents}</td><td>{skill.score}</td>
              <td><span className={`status-pill ${skill.isActive ? 'status-verified' : 'status-pending'}`}>{skill.isActive ? 'Active' : 'Inactive'}</span></td>
              <td><div className="toolbar-filters"><Button variant="secondary" onClick={() => openEdit(skill)}><Edit3 size={14} /> Edit</Button>
                {skill.isActive
                  ? <Button variant="secondary" busy={busyId === skill.id} onClick={() => window.confirm(`Deactivate ${skill.name}? Existing scores and relationships will be retained.`) && setActive(skill, false)}><Trash2 size={14} /> Deactivate</Button>
                  : <Button variant="secondary" busy={busyId === skill.id} onClick={() => setActive(skill, true)}><RotateCcw size={14} /> Reactivate</Button>}
              </div></td>
            </tr>)}</tbody></table></div></div>
        ))}
      </Card>
      {showModal && <Modal title={editing ? 'Edit skill' : 'Add a skill'} onClose={() => setShowModal(false)} onSubmit={saveSkill} submitLabel={editing ? 'Save skill' : 'Add skill'} busy={busy}>
        <label className="field-label">Skill name<input required maxLength={80} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label className="field-label">Category<input required maxLength={80} value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} /></label>
        <label className="field-label">Description<textarea rows={4} maxLength={1000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
        {error && <Notice kind="error">{error}</Notice>}
      </Modal>}
    </>
  );
}
