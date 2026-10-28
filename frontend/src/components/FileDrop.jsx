import { useState } from 'react';

const isExcel = (f) => /\.(xlsx|xls)$/i.test(f?.name || '');
const size = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

// Excel upload box: click karke browse ya drag & drop
export default function FileDrop({ file, onChange, disabled }) {
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState(null);

  const pick = (f) => {
    if (!f) return;
    if (!isExcel(f)) { setRejected(f.name); return; }
    setRejected(null);
    onChange(f);
  };

  return (
    <label
      className={`file-drop${over ? ' over' : ''}${file ? ' has-file' : ''}${disabled ? ' disabled' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) pick(e.dataTransfer.files[0]); }}
    >
      <input
        type="file"
        accept=".xlsx,.xls"
        disabled={disabled}
        onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }}
      />
      <span className="file-drop-icon" aria-hidden="true">XLS</span>
      {file ? (
        <span className="file-drop-text">
          <strong>{file.name}</strong>
          <small>{size(file.size)} · click or drop a new file to replace</small>
        </span>
      ) : (
        <span className="file-drop-text">
          <strong>Drop your Excel file here or <u>browse</u></strong>
          <small>{rejected ? `"${rejected}" is not an Excel file — only .xlsx / .xls` : 'Only .xlsx / .xls · max 10 MB'}</small>
        </span>
      )}
    </label>
  );
}
