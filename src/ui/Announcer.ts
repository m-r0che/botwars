const el = () => document.getElementById('announcer')!;

let hideTimer: number | null = null;

export function showAnnouncement(text: string, color: string = '#ff6b6b', duration: number = 2000) {
  const announcer = el();
  announcer.textContent = text;
  announcer.style.color = color;
  announcer.classList.add('visible');

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    announcer.classList.remove('visible');
  }, duration);
}
