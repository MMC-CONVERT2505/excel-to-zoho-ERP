const MAX_GROUPS = 8;
const MAX_REFS = 8;

// Ek jaise error wali rows ek line me: "12 rows · From Account not found… · Row 2, 5, 9 …"
// items: [{ ref, message, tone }]
export default function ProblemGroups({ title, items }) {
  if (!items.length) return null;
  const groups = new Map();
  for (const it of items) {
    const key = it.message || 'Unknown problem';
    if (!groups.has(key)) groups.set(key, { message: key, tone: it.tone, refs: [] });
    groups.get(key).refs.push(it.ref);
  }
  const list = [...groups.values()].sort((a, b) => b.refs.length - a.refs.length);

  return (
    <div className="problem-groups">
      <strong>{title}</strong>
      <ul>
        {list.slice(0, MAX_GROUPS).map((g) => (
          <li key={g.message} className={`tone-border-${g.tone || 'bad'}`}>
            <span className="problem-count">{g.refs.length}×</span>
            <span className="problem-text">
              {g.message}
              <small>{g.refs.slice(0, MAX_REFS).join(', ')}{g.refs.length > MAX_REFS && ` … +${g.refs.length - MAX_REFS} more`}</small>
            </span>
          </li>
        ))}
      </ul>
      {list.length > MAX_GROUPS && <p className="hint">+ {list.length - MAX_GROUPS} other kinds of problems — see the table below or download the report.</p>}
    </div>
  );
}
