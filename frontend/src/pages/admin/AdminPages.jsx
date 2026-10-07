import { Card } from '../../components/Card';
import { EmptyState, PageHeader, QueryState } from '../../components/Workspace';
import { useApi } from '../../hooks/useApi';
import { adminService } from '../../services/adminService';
import { initials } from '../../utils/formatters';

export function AdminMentorsPage() {
  const query = useApi(() => adminService.getDirectory(), []);
  const mentors = query.data?.mentors ?? [];

  return (
    <>
      <PageHeader
        eyebrow="MENTOR DIRECTORY"
        title="The people helping learners level up."
        description="See current mentors and their account details."
      />
      <QueryState loading={query.loading} error={query.error} onRetry={query.reload} />
      {query.data && (mentors.length ? (
        <div className="student-grid">
          {mentors.map(mentor => (
            <Card className="student-card" key={mentor.id}>
              <div className="student-card-head">
                <span className="avatar avatar-large">{initials(mentor.name)}</span>
                <div className="grow">
                  <h3>{mentor.name}</h3>
                  <span className="muted">{mentor.email}</span>
                </div>
                <span className={`status-pill status-${mentor.status === 'Active' ? 'verified' : 'rejected'}`}>
                  {mentor.status}
                </span>
              </div>
              <div className="student-progress-line">
                <span>Students in cohort</span>
                <strong>{mentor.studentCount}</strong>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No mentors yet" detail="Create a mentor account from the Users directory." />
      ))}
    </>
  );
}
