// Result ke counts chips me: [{ label, value, tone }] — 0 wale chips (total ke alawa) chhupa dete hain
export default function ResultSummary({ title, items }) {
  return (
    <div className="result-summary">
      <strong>{title}</strong>
      <div className="summary-chips">
        {items.filter((i) => i.always || i.value > 0).map((i) => (
          <span key={i.label} className={`summary-chip tone-${i.tone || 'neutral'}`}>
            <b>{i.value}</b> {i.label}
          </span>
        ))}
      </div>
    </div>
  );
}
