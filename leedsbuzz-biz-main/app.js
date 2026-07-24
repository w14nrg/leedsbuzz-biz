(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const menuButton = $('#menuBtn');
  const navigation = $('#mainNav');
  menuButton?.addEventListener('click', () => {
    const open = navigation?.classList.toggle('open') || false;
    menuButton.setAttribute('aria-expanded', String(open));
  });

  const activePage = document.body.dataset.page;
  if (activePage) {
    $$('[data-nav]').forEach(link => link.classList.toggle('active', link.dataset.nav === activePage));
  }

  document.addEventListener('click', event => {
    if (!navigation?.classList.contains('open')) return;
    if (event.target.closest('#mainNav a')) {
      navigation.classList.remove('open');
      menuButton?.setAttribute('aria-expanded', 'false');
    }
  });

  $$('.poll-option').forEach(button => {
    button.addEventListener('click', () => {
      const group = button.closest('.poll-card,.fan-meter,.now-card') || document;
      $$('.poll-option', group).forEach(option => option.removeAttribute('aria-pressed'));
      button.setAttribute('aria-pressed', 'true');
    });
  });
})();
