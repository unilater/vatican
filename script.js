const jumpButtons = document.querySelectorAll('[data-jump]');
const playerToggle = document.getElementById('player-toggle');
const playerStatus = document.getElementById('player-status');
const liveStatus = document.getElementById('live-status');
const liveFeedItems = document.querySelectorAll('#live-feed-list li');

jumpButtons.forEach((button) => {
  button.addEventListener('click', () => {
    document.getElementById(button.dataset.jump)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  });
});

if (playerToggle && playerStatus) {
  playerToggle.addEventListener('click', () => {
    const isPlaying = playerToggle.dataset.state === 'playing';

    if (isPlaying) {
      playerToggle.dataset.state = 'idle';
      playerToggle.textContent = 'Ascolta ora';
      playerStatus.textContent = 'Diretta disponibile';
      return;
    }

    playerToggle.dataset.state = 'playing';
    playerToggle.textContent = 'Metti in pausa';
    playerStatus.textContent = 'In ascolto adesso';
  });
}

if (liveStatus && liveFeedItems.length > 0) {
  let freshIndex = 0;
  const statuses = ['Segnale stabile', 'Nuovo aggiornamento', 'Feed in tempo reale'];

  window.setInterval(() => {
    liveFeedItems.forEach((item) => item.classList.remove('is-fresh'));
    liveFeedItems[freshIndex].classList.add('is-fresh');
    liveStatus.textContent = statuses[freshIndex % statuses.length];
    freshIndex = (freshIndex + 1) % liveFeedItems.length;
  }, 3200);
}