const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;

// Хранилище: облако Telegram у каждого пользователя, вне Telegram localStorage для разработки.
const Store = {
  cloud: () => tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9'),
  get(key) {
    return new Promise((resolve) => {
      if (Store.cloud()) return tg.CloudStorage.getItem(key, (err, v) => resolve(err ? null : v || null));
      try { resolve(localStorage.getItem(key)); } catch (e) { resolve(null); }
    });
  },
  set(key, value) {
    return new Promise((resolve) => {
      if (Store.cloud()) return tg.CloudStorage.setItem(key, value, () => resolve());
      try { localStorage.setItem(key, value); } catch (e) { /* приватный режим */ }
      resolve();
    });
  }
};

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const timeStr = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
const haptic = () => { if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged(); };

const emptyDay = () => ({ text: '', mood: null, spheres: {}, insight: '', reflection: ['', '', ''], moon: '' });

async function loadDay(iso) {
  const raw = await Store.get('d_' + iso);
  if (!raw) return emptyDay();
  try { return Object.assign(emptyDay(), JSON.parse(raw)); } catch (e) { return emptyDay(); }
}
const saveDay = (iso, data) => Store.set('d_' + iso, JSON.stringify(data));

function dayMeta(date) {
  const m = Moon.info(date);
  const month = date.getMonth();
  const cycleIdx = Math.floor(month / 3);
  const cycleStart = new Date(date.getFullYear(), cycleIdx * 3, 1, 12);
  const cycleEnd = new Date(date.getFullYear(), cycleIdx * 3 + 3, 0, 12);
  const cycleDay = Moon.dayIndex(date) - Moon.dayIndex(cycleStart) + 1;
  const cycleLen = Moon.dayIndex(cycleEnd) - Moon.dayIndex(cycleStart) + 1;
  return {
    moon: m,
    hint: Content.hints[Math.min(30, m.lunarDay)] || Content.hints[1],
    principle: Content.principles[month],
    cycle: { n: cycleIdx + 1, name: Content.cycles[cycleIdx].name, day: cycleDay, len: cycleLen }
  };
}

const moonIcon = (phase, size) => {
  const s = size || 40;
  if (phase === 'new') return `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="#1C2442" stroke="#E8C872" stroke-width="2"/></svg>`;
  if (phase === 'full') return `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="#E8C872"/><circle cx="17" cy="18" r="3" fill="#D8B45A"/><circle cx="29" cy="30" r="4.5" fill="#D8B45A"/></svg>`;
  const d = phase === 'waxing' ? 'M24 3 A21 21 0 0 1 24 45 A12 21 0 0 0 24 3 Z' : 'M24 3 A21 21 0 0 0 24 45 A12 21 0 0 1 24 3 Z';
  return `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="none" stroke="#E8C872" stroke-width="2"/><path d="${d}" fill="#E8C872"/></svg>`;
};

// ---------- Экраны ----------

function viewToday() {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const iso = isoDate(now);
  const meta = dayMeta(now);
  const pct = Math.round(meta.cycle.day / meta.cycle.len * 100);
  return `
    <header class="cover">
      <div class="cover-title">БлагоЛуна</div>
      ${moonIcon(meta.moon.phase, 44)}
    </header>
    <main class="page">
      <a class="today-card" href="#/day/${iso}">
        <span class="eyebrow">Сегодня · ${now.getDate()} ${Content.monthsGen[now.getMonth()]}</span>
        <span class="today-ld">${meta.moon.lunarDay}-й лунный день</span>
        <span class="muted">${Moon.PHASE_NAMES[meta.moon.phase]}</span>
        <span class="today-hint">${esc(meta.hint)}</span>
        <span class="btn">Открыть мой день</span>
      </a>
      <div class="grid2">
        <div class="tile">
          <span class="eyebrow">Принцип месяца</span>
          <b>${meta.principle[0]}</b>
          <span class="muted">${meta.principle[1]}</span>
        </div>
        <div class="tile">
          <span class="eyebrow">Цикл ${meta.cycle.n} · ${meta.cycle.name}</span>
          <b>День ${meta.cycle.day} из ${meta.cycle.len}</b>
          <span class="bar"><span style="width:${pct}%"></span></span>
        </div>
      </div>
    </main>`;
}

function viewCalendar(ym) {
  const now = new Date();
  const [y, m] = ym ? ym.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const first = new Date(y, m - 1, 1, 12);
  const daysIn = new Date(y, m, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const todayIso = isoDate(now);
  const prev = m === 1 ? (y - 1) + '-12' : y + '-' + pad(m - 1);
  const next = m === 12 ? (y + 1) + '-01' : y + '-' + pad(m + 1);
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span class="cell empty"></span>';
  for (let d = 1; d <= daysIn; d++) {
    const date = new Date(y, m - 1, d, 12);
    const info = Moon.info(date);
    const iso = isoDate(date);
    const cls = ['cell', info.phase === 'new' ? 'is-new' : '', info.phase === 'full' ? 'is-full' : '', iso === todayIso ? 'is-today' : ''].join(' ');
    const mark = info.phase === 'new' || info.phase === 'full' ? moonIcon(info.phase, 14) : `<small>${info.lunarDay}</small>`;
    cells += `<a class="${cls}" href="#/day/${iso}"><b>${d}</b>${mark}</a>`;
  }
  const principle = Content.principles[m - 1];
  const events = Moon.events(y).filter((e) => e.date.getFullYear() === y && e.date.getMonth() === m - 1);
  const evList = events.map((e) => `<li>${moonIcon(e.type, 16)} ${e.type === 'new' ? 'Новолуние' : 'Полнолуние'} · ${e.date.getDate()} ${Content.monthsGen[m - 1]}, ${timeStr(e.date)}</li>`).join('');
  return `
    <header class="cover small"><div class="cover-title">${Content.months[m - 1]}</div></header>
    <main class="page">
      <div class="month-nav">
        <a class="icon-btn" href="#/calendar/${prev}" aria-label="Предыдущий месяц">‹</a>
        <b>${Content.months[m - 1]} ${y}</b>
        <a class="icon-btn" href="#/calendar/${next}" aria-label="Следующий месяц">›</a>
      </div>
      <div class="muted">Принцип месяца: <b>${principle[0]}</b> · ${principle[1]}</div>
      <div class="weekdays"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div>
      <div class="calendar">${cells}</div>
      <ul class="events">${evList}</ul>
      <p class="muted small">Маленькая цифра в клетке это лунный день. Время по твоему часовому поясу.</p>
    </main>`;
}

async function viewDay(iso) {
  const date = parseDate(iso);
  const meta = dayMeta(date);
  const data = await loadDay(iso);
  const wd = date.getDay();
  const ritual = Content.rituals[meta.moon.phase];

  const moods = Content.moods.map((label, i) =>
    `<button type="button" class="chip ${data.mood === i ? 'on' : ''}" data-mood="${i}">${label}</button>`).join('');
  const spheres = Content.spheres.map((name, si) => {
    const dots = [1, 2, 3, 4, 5].map((n) =>
      `<button type="button" class="dot ${data.spheres[si] === n ? 'on' : ''}" data-sphere="${si}" data-val="${n}" aria-label="${name}: ${n}">${n}</button>`).join('');
    return `<div class="sphere"><span>${name}</span><div class="dots">${dots}</div></div>`;
  }).join('');

  const ritualBlock = ritual ? `
    <section class="plaque ${meta.moon.phase}">
      <b>${ritual.title}${meta.moon.eventTime ? ' · ' + timeStr(meta.moon.eventTime) : ''}</b>
      <ol class="steps">${ritual.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      <label for="f-moon">${ritual.field}</label>
      <input id="f-moon" data-field="moon" type="text" placeholder="${ritual.placeholder}" value="${esc(data.moon)}">
    </section>` : '';
  const satBlock = wd === 6 ? `
    <section class="plaque sat">
      <span class="eyebrow">${Content.insight.title}</span>
      <label for="f-insight"><b>${Content.insight.question}</b></label>
      <textarea id="f-insight" data-field="insight" rows="3" placeholder="Одна мысль, которую хочется забрать с собой…">${esc(data.insight)}</textarea>
    </section>` : '';
  const sunBlock = wd === 0 ? `
    <section class="plaque sun">
      <span class="eyebrow">${Content.reflection.title}</span>
      ${Content.reflection.questions.map((q, i) => `<label for="f-r${i}">${i + 1}. ${q}</label><input id="f-r${i}" data-refl="${i}" type="text" value="${esc(data.reflection[i])}">`).join('')}
    </section>` : '';

  return `
    <header class="cover">
      <div class="cover-title">${meta.moon.lunarDay}-й лунный день</div>
      ${moonIcon(meta.moon.phase, 44)}
    </header>
    <main class="page" data-day="${iso}">
      <div>
        <h1>${Content.weekdays[wd]}, ${date.getDate()} ${Content.monthsGen[date.getMonth()]}</h1>
        <div class="muted">${Moon.PHASE_NAMES[meta.moon.phase]} · Цикл ${meta.cycle.n} · ${meta.principle[0]}</div>
      </div>
      <section class="hint"><span class="eyebrow">Подсказка дня</span><p>${esc(meta.hint)}</p></section>
      <section>
        <label class="eyebrow" for="f-text">Мой день одной строкой</label>
        <input id="f-text" data-field="text" type="text" placeholder="Сегодня я…" value="${esc(data.text)}">
      </section>
      <section>
        <span class="eyebrow">Сферы жизни сегодня · от 1 до 5</span>
        <div class="spheres">${spheres}</div>
      </section>
      <section>
        <span class="eyebrow">Состояние</span>
        <div class="chips">${moods}</div>
      </section>
      ${ritualBlock}${satBlock}${sunBlock}
      <a class="channel" href="${Content.channelUrl}" data-external>Обсудить этот день в канале <span>›</span></a>
      <p class="muted small saved" id="saved">Всё сохраняется само</p>
    </main>`;
}

// ---------- Сохранение ввода на странице дня ----------

function bindDay(root, iso) {
  let data = null;
  const ready = loadDay(iso).then((d) => { data = d; });
  let timer = null;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      saveDay(iso, data).then(() => {
        const el = document.getElementById('saved');
        if (el) { el.textContent = 'Сохранено'; setTimeout(() => { el.textContent = 'Всё сохраняется само'; }, 1500); }
      });
    }, 400);
  };

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    await ready;
    if (b.dataset.mood !== undefined) {
      const v = Number(b.dataset.mood);
      data.mood = data.mood === v ? null : v;
      root.querySelectorAll('[data-mood]').forEach((x) => x.classList.toggle('on', Number(x.dataset.mood) === data.mood));
    } else if (b.dataset.sphere !== undefined) {
      const si = b.dataset.sphere, v = Number(b.dataset.val);
      data.spheres[si] = data.spheres[si] === v ? undefined : v;
      root.querySelectorAll(`[data-sphere="${si}"]`).forEach((x) => x.classList.toggle('on', Number(x.dataset.val) === data.spheres[si]));
    } else return;
    haptic();
    persist();
  });

  root.addEventListener('input', async (e) => {
    await ready;
    const t = e.target;
    if (t.dataset.field) data[t.dataset.field] = t.value;
    else if (t.dataset.refl !== undefined) data.reflection[Number(t.dataset.refl)] = t.value;
    else return;
    persist();
  });
}

// ---------- Навигация ----------

const app = document.getElementById('app');
const tabs = document.querySelectorAll('.tabbar a');

async function route() {
  const hash = location.hash || '#/today';
  const [, name, arg] = hash.split('/');
  let html;
  if (name === 'day' && arg) html = await viewDay(arg);
  else if (name === 'calendar') html = viewCalendar(arg);
  else html = viewToday();
  app.innerHTML = html;
  window.scrollTo(0, 0);
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === (name || 'today')));
  if (name === 'day' && arg) bindDay(app, arg);
  if (tg) {
    if (name === 'day') tg.BackButton.show(); else tg.BackButton.hide();
  }
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-external]');
  if (a && tg) { e.preventDefault(); tg.openTelegramLink(a.href); }
});

if (tg) {
  tg.ready();
  tg.expand();
  if (tg.setHeaderColor) tg.setHeaderColor('#2E3A66');
  if (tg.setBackgroundColor) tg.setBackgroundColor('#FFFFFF');
  tg.BackButton.onClick(() => history.back());
}

window.addEventListener('hashchange', route);
route();
