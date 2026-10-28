// notice: { type: 'ok' | 'error' | 'warn' | 'info', text, action?: { label, onClick } }
export default function Notice({ notice }) {
  if (!notice) return null;
  return (
    <div className={`notice ${notice.type}`} role="status">
      <span>{notice.text}</span>
      {notice.action && (
        <button type="button" className="notice-action" onClick={notice.action.onClick}>{notice.action.label}</button>
      )}
    </div>
  );
}
