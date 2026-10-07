import { Activity, ArrowRight, BookOpen, GraduationCap, ShieldCheck, UserRoundCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { PageHeader, QueryState, StatCard } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { adminService } from '../../services/adminService';
import { formatDate } from '../../utils/formatters';

export default function AdminDashboardPage() {
  const query = useApi(() => adminService.getDashboard(), []);
  const data = query.data;
  const stats = data?.stats || {};
  return (
    <>
      <PageHeader eyebrow="ADMIN CONTROL" title="Platform overview" description="Monitor the real-time account, catalog, and review totals for SkillTrack." />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {data && (
        <>
          <div className="stats-grid">
            <StatCard label="Total users" value={stats.users ?? 0} detail={`${stats.activeUsers ?? 0} active accounts`} icon={Users} />
            <StatCard label="Students" value={stats.students ?? 0} detail="All student accounts" icon={GraduationCap} tone="violet" />
            <StatCard label="Mentors" value={stats.mentors ?? 0} detail="All mentor accounts" icon={UserRoundCheck} tone="green" />
            <StatCard label="Active skills" value={stats.skills ?? 0} detail="In the learning catalog" icon={BookOpen} tone="amber" />
            <StatCard label="Pending reviews" value={stats.pendingReviews ?? 0} detail="Evidence awaiting review" icon={Activity} tone="violet" />
          </div>
          <div className="admin-dashboard-grid">
            <Card>
              <div className="section-heading">
                <div><p className="eyebrow">PLATFORM OPERATIONS</p><h3>Administration</h3></div>
                <span className="status-pill"><ShieldCheck size={14} /> Role-protected</span>
              </div>
              <p className="muted">Manage accounts, mentor assignments, skill relationships, scoring versions, and security activity.</p>
              <div className="health-lines">
                <span><i /> User directory <strong>{stats.users ?? 0} records</strong></span>
                <span><i /> Skill catalog <strong>{stats.skills ?? 0} active skills</strong></span>
                <span><i /> Active scoring rules <strong>{data.activeRule}</strong></span>
              </div>
            </Card>
            <Card>
              <div className="section-heading">
                <div><p className="eyebrow">RECENT ACTIVITY</p><h3>Latest audit events</h3></div>
                <Link className="text-link" to="/admin/audit">Audit log <ArrowRight size={14} /></Link>
              </div>
              {data.audit.length === 0 ? <p className="muted">No audit events have been recorded yet.</p> : data.audit.slice(0, 5).map(item => (
                <div className="activity-line" key={item.id}>
                  <span className="activity-dot" />
                  <div className="grow"><strong>{item.details}</strong><small>{item.actor} · {formatDate(item.createdAt)}</small></div>
                </div>
              ))}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
