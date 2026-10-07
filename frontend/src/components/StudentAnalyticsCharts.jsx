import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const STATUS_COLORS = {
  Verified: '#4d9272',
  Pending: '#d49b4f',
  Rejected: '#c87872',
};

export function WeeklyGrowthChart({ skills }) {
  return (
    <div className="student-analytics-chart" role="img" aria-label="Chart showing skill score change over the last seven days">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={skills} margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#edf0eb" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#59645d', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#87928a', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={value => [`${value > 0 ? '+' : ''}${value} points`, 'Score change']} />
          <Bar dataKey="weeklyGrowth" name="Score change" fill="#7292ad" radius={[5, 5, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EvidenceStatusChart({ achievements }) {
  const data = ['Verified', 'Pending', 'Rejected']
    .map(status => ({
      name: status,
      value: achievements.filter(achievement => achievement.status === status).length,
    }))
    .filter(item => item.value > 0);
  if (!data.length) return null;

  return (
    <div className="student-evidence-chart">
      <div className="student-analytics-chart" role="img" aria-label="Review status of recent achievement submissions">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="76%" paddingAngle={3}>
              {data.map(item => <Cell key={item.name} fill={STATUS_COLORS[item.name]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="student-evidence-legend">
        {data.map(item => (
          <li key={item.name}>
            <span><i style={{ backgroundColor: STATUS_COLORS[item.name] }} />{item.name}</span>
            <strong>{item.value}</strong>
          </li>
        ))}
      </ul>
      <p className="muted">Status of the recent submissions shown below.</p>
    </div>
  );
}
