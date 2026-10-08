/*
  Навигация для презентаций на shared/css/deck.css:
  стрелки, точки, полноэкранный режим, печать в PDF, клавиатура.
  Разметку под неё см. в shared/templates/slide-deck.html.
*/
(function () {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const total = slides.length;
  let idx = 0;

  const dotsEl = document.getElementById('dots');
  slides.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'd' + (i === 0 ? ' active' : '');
    d.addEventListener('click', () => go(i));
    dotsEl.appendChild(d);
  });
  const dotEls = Array.from(dotsEl.children);
  document.getElementById('total').textContent = total;

  function render() {
    slides.forEach((s, i) => s.classList.toggle('active', i === idx));
    dotEls.forEach((d, i) => d.classList.toggle('active', i === idx));
    document.getElementById('cur').textContent = idx + 1;
    document.getElementById('progress').style.width = ((idx + 1) / total * 100) + '%';
  }
  function go(i) { idx = Math.max(0, Math.min(total - 1, i)); render(); }
  function next() { go(idx < total - 1 ? idx + 1 : 0); }
  function prev() { go(idx > 0 ? idx - 1 : total - 1); }

  document.getElementById('next-btn').addEventListener('click', next);
  document.getElementById('prev-btn').addEventListener('click', prev);
  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.getElementById('fs-btn').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  });

  window.addEventListener('keydown', (e) => {
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === 'f' || e.key === 'F') { document.getElementById('fs-btn').click(); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(total - 1);
  });

  function scaleDeck() {
    const deck = document.getElementById('deck');
    const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720) * 0.94;
    deck.style.transform = 'scale(' + scale + ')';
  }
  window.addEventListener('resize', scaleDeck);
  scaleDeck();
  render();
})();
