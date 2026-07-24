(() => {
  const tokenInput = document.getElementById('adminToken');
  const result = document.getElementById('adminResult');
  const saved = sessionStorage.getItem('bizbot_admin_token') || '';
  if (saved) tokenInput.value = saved;

  async function run(source) {
    const token = tokenInput.value.trim();
    if (!token) {
      result.textContent = 'Enter the BIZBOT_ADMIN_TOKEN first.';
      return;
    }
    sessionStorage.setItem('bizbot_admin_token', token);
    result.textContent = `Running ${source}…`;
    try {
      const r = await fetch('/api/bizbot/admin/harvest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ source })
      });
      const data = await r.json().catch(() => ({}));
      result.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      result.textContent = String(e?.message || e);
    }
  }

  document.querySelectorAll('[data-source]').forEach(btn => {
    btn.addEventListener('click', () => run(btn.dataset.source));
  });
})();