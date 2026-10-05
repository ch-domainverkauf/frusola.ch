// The bid: an amount, a meter that reads how well it fits the seller's price expectation, and the form.
// The meter is deliberately unnumbered – it shows a tendency, not the expectation itself.
(() => {
  const root = document.querySelector('[data-auction]');
  if (!root) return;
  const cfg = JSON.parse(root.dataset.auction);             // { min, scale, max, step }
  const amount = root.querySelector('[data-amount]');
  const slider = root.querySelector('[data-slider]');
  const needle = root.querySelector('[data-needle]');
  const word = root.querySelector('[data-strength]');
  const dot = root.querySelector('[data-dot]');
  const note = root.querySelector('[data-note]');
  const form = root.querySelector('[data-bid-form]');
  const status = root.querySelector('[data-status]');
  const done = root.querySelector('[data-done]');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LEVELS = [
    [0.00, 'Sehr gering', 'red'], [0.20, 'Gering', 'red'], [0.36, 'Mittel', 'amber'],
    [0.48, 'Ordentlich', 'amber'], [0.58, 'Gut', 'green'], [0.74, 'Sehr gut', 'green'], [0.88, 'Ausgezeichnet', 'green'],
  ];
  // saturating curve: quick gains at first, ever smaller ones towards the top
  const strength = (chf) => (chf > 0 ? 1 - Math.exp(-chf / cfg.scale) : 0);
  // the slider walks in even steps of strength, so its whole length is useful
  const fromSlider = (s) => Math.round(-cfg.scale * Math.log(1 - s * .985) / cfg.step) * cfg.step;
  const toSlider = (chf) => Math.min(1, strength(chf) / .985);
  const fmt = (n) => n.toLocaleString('de-CH');

  let target = 0, shown = 0, velocity = 0, raf = 0;
  function render(pos) {
    needle.style.setProperty('--a', `${(pos * 180 - 90).toFixed(2)}deg`);
  }
  function animate() {
    cancelAnimationFrame(raf);
    if (still) { shown = target; render(shown); return; }
    const step = () => {
      // a damped spring: the needle swings in and settles, like a real instrument
      const force = (target - shown) * .09 - velocity * .32;
      velocity += force; shown += velocity;
      render(shown);
      if (Math.abs(target - shown) > .0005 || Math.abs(velocity) > .0005) raf = requestAnimationFrame(step);
      else { shown = target; render(shown); }
    };
    raf = requestAnimationFrame(step);
  }

  function update(chf, from) {
    const valid = Number.isFinite(chf) && chf > 0;
    const pos = valid ? strength(chf) : 0;
    target = pos;
    animate();
    const level = LEVELS.filter(([at]) => pos >= at).pop();
    root.dataset.level = valid ? level[2] : 'none';
    word.textContent = valid ? level[1] : '—';
    if (from !== 'slider') slider.value = valid ? toSlider(chf) : 0;
    if (from !== 'input') amount.value = valid ? fmt(chf) : '';
    if (!valid) note.textContent = 'Geben Sie einen Betrag ein, um die Gebotsstärke zu sehen.';
    else if (chf < cfg.min) note.textContent = `Das Mindestgebot beträgt CHF ${fmt(cfg.min)}.`;
    else note.textContent = 'Unverbindliche Einschätzung im Verhältnis zur Preisvorstellung des Verkäufers.';
  }

  const parse = (s) => {
    const n = parseInt(String(s).replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? Math.min(n, 9999999) : NaN;
  };
  amount.addEventListener('input', () => update(parse(amount.value), 'input'));
  amount.addEventListener('blur', () => { const n = parse(amount.value); if (n) amount.value = fmt(n); });
  slider.addEventListener('input', () => update(Math.max(cfg.step, fromSlider(+slider.value)), 'slider'));
  root.querySelectorAll('[data-nudge]').forEach((b) => b.addEventListener('click', () => {
    const n = Math.max(0, (parse(amount.value) || 0) + Number(b.dataset.nudge));
    update(n || NaN);
  }));
  update(NaN);

  // ----- form -----
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const chf = parse(amount.value);
    const email = form.querySelector('[name="email"]');
    const consent = form.querySelector('[name="consent"]');
    const say = (msg, el) => { status.textContent = msg; el?.focus(); };
    if (!chf || chf < cfg.min) return say(`Bitte geben Sie ein Gebot ab CHF ${fmt(cfg.min)} ein.`, amount);
    if (!email.value.trim() || !email.checkValidity()) return say('Bitte geben Sie eine gültige E-Mail-Adresse ein.', email);
    if (!consent.checked) return say('Bitte bestätigen Sie die Bedingungen des Bieterverfahrens und die Datenschutzerklärung.', consent);
    status.textContent = '';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    data.gebot_chf = chf;
    const endpoint = form.dataset.endpoint;
    // a live page without an inbox must never pretend a bid arrived; only the preview build may
    if (!endpoint && !('preview' in form.dataset)) {
      say('Gebote werden in Kürze entgegengenommen. Bitte versuchen Sie es später noch einmal.');
      button.disabled = false;
      return;
    }
    try {
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST', body: JSON.stringify(data),
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || String(body.success) === 'false') throw new Error(body.message || `HTTP ${res.status}`);
      }
      done.querySelector('[data-done-amount]').textContent = `CHF ${fmt(chf)}`;
      done.querySelector('[data-done-preview]').hidden = Boolean(endpoint);
      root.classList.add('is-done');
      done.focus();
    } catch {
      say('Ihr Gebot ist nicht angekommen. Bitte versuchen Sie es in einem Moment noch einmal.');
      button.disabled = false;
    }
  });
})();
