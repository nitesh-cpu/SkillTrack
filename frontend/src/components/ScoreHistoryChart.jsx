import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function ScoreHistoryChart({ history }) {
  const data = history.map(item => ({
    ...item,
    dateLabel: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
      .format(new Date(item.calculatedAt)),
  }));
  return (
    <div className="student-analytics-chart" role="img" aria-label="Line chart showing recorded skill scores over time">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: -12 }}>
          <CartesianGrid stroke="#edf0eb" strokeDasharray="3 3" />
          <XAxis dataKey="dateLabel" tick={{ fill: '#59645d', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: '#87928a', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={value => [`${value} / 100`, 'Score']} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#4d9272"
            strokeWidth={2}
            dot={{ fill: '#4d9272', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
