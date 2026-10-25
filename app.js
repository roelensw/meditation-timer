const numberEl = document.getElementById('number');
const statusEl = document.getElementById('status');

document.getElementById('roll').addEventListener('click', () => {
  numberEl.textContent = Math.floor(Math.random() * 100) + 1;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(
    () => { statusEl.textContent = 'Works offline'; },
    () => { statusEl.textContent = 'Offline mode unavailable'; }
  );
}
