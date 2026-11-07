export function downloadText(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeName(s: string) {
  return (s.trim() || 'cutforge').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 60);
}
