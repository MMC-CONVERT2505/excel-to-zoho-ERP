// Sab API calls yahin se jaate hain
export async function http(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  // App password ka session khatam — App password screen dikhaye
  if (res.status === 401 && data.code === 'APP_LOCKED') window.dispatchEvent(new Event('app-locked'));
  if (!res.ok) throw Object.assign(new Error(data.message || `Request failed (${res.status})`), { status: res.status, data });
  return data;
}
