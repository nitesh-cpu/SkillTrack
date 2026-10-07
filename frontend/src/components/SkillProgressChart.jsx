import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function SkillProgressChart({ skills }) {
  const height = Math.max(220, skills.length * 42);

  return (
    <div
      className="progress-chart"
      role="img"
      aria-label="Bar chart of current scores for each tracked skill"
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={skills}
          layout="vertical"
          margin={{ top: 8, right: 18, bottom: 8, left: 8 }}
        >
          <CartesianGrid stroke="#edf0eb" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: '#87928a', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={116}
            tick={{ fill: '#59645d', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: '#f7f9f6' }}
            formatter={value => [`${value}%`, 'Current score']}
          />
          <Bar dataKey="score" fill="#4d9272" radius={[0, 5, 5, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
