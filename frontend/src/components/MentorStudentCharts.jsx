import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const TREND_COLORS = ['#4d9272', '#7292ad', '#d49b4f', '#8b7db8', '#c87872', '#3e9ba3'];

export function MentorStudentCharts({ skills, scoreHistory = [] }) {
  if (!skills.length) return null;
  const historyByDate = new Map();
  for (const item of scoreHistory) {
    const date = new Date(item.calculatedAt);
    if (!Number.isFinite(date.getTime())) continue;
    const key = date.toISOString();
    if (!historyByDate.has(key)) historyByDate.set(key, { date: key, dateLabel: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date) });
    historyByDate.get(key)[item.skillName] = item.score;
  }
  const trend = [...historyByDate.values()].sort((left, right) => new Date(left.date) - new Date(right.date));
  return (
    <>
      <div className="mentor-chart" role="img" aria-label="Current recorded score for each student skill">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={skills} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="#edf0eb" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: '#87928a', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#59645d', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={value => [`${value} / 100`, 'Current score']} />
            <Bar dataKey="score" fill="#4d9272" radius={[0, 5, 5, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {trend.length > 1 && (
        <div className="mentor-chart mentor-trend-chart" role="img" aria-label="Recorded skill score history over time">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
              <CartesianGrid stroke="#edf0eb" strokeDasharray="3 3" />
              <XAxis dataKey="dateLabel" tick={{ fill: '#59645d', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#87928a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={value => [`${value} / 100`, 'Recorded score']} />
              {skills.map((skill, index) => <Line key={skill.id} type="monotone" dataKey={skill.name} name={skill.name} connectNulls stroke={TREND_COLORS[index % TREND_COLORS.length]} dot={false} strokeWidth={2} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
