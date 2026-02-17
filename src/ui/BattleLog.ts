const content = () => document.getElementById('battle-log-content')!;
const container = () => document.getElementById('battle-log')!;

export function clearLog() {
  content().innerHTML = '';
}

export function addLogEntry(text: string, cssClass: string = '') {
  const el = document.createElement('p');
  el.className = `log-entry ${cssClass}`;
  el.textContent = `> ${text}`;
  content().appendChild(el);
  container().scrollTop = container().scrollHeight;
}
