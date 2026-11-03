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
  // Пачкой, чтобы календарь не делал 30 отдельных запросов в облако.
  getMany(keys) {
    return new Promise((resolve) => {
      if (Store.cloud()) return tg.CloudStorage.getItems(keys, (err, v) => resolve(err ? {} : v || {}));
      const out = {};
      try { keys.forEach((k) => { out[k] = localStorage.getItem(k); }); } catch (e) { /* приватный режим */ }
      resolve(out);
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
const todayIso = () => isoDate(new Date());
const PRIVACY = tg ? 'Записи видишь только ты. Они хранятся в твоём Telegram.' : 'Записи видишь только ты. Они хранятся на этом устройстве.';

const parse = (raw, fallback) => { try { return Object.assign(fallback, JSON.parse(raw || '{}')); } catch (e) { return fallback; } };

const emptyDay = () => ({ text: '', mood: null, insight: '', reflection: ['', '', ''], moon: '' });
const loadDay = async (iso) => parse(await Store.get('d_' + iso), emptyDay());
const saveDay = (iso, data) => Store.set('d_' + iso, JSON.stringify(data));

const emptyYear = () => ({ sankalpa: '', letter: '', wheel: {} });
const loadYear = async (y) => parse(await Store.get('y_' + y), emptyYear());
const saveYear = (y, data) => Store.set('y_' + y, JSON.stringify(data));

// Отметки состояния за месяц: { 'YYYY-MM-DD': mood }.
async function monthMoods(y, m) {
  const daysIn = new Date(y, m, 0).getDate();
  const keys = [];
  for (let d = 1; d <= daysIn; d++) keys.push('d_' + y + '-' + pad(m) + '-' + pad(d));
  const raw = await Store.getMany(keys);
  const out = {};
  keys.forEach((k) => {
    const v = parse(raw[k], {});
    if (v.mood !== null && v.mood !== undefined) out[k.slice(2)] = v.mood;
  });
  return out;
}

function dayMeta(date) {
  const m = Moon.info(date);
  return { moon: m, hint: Content.hints[Math.min(30, m.lunarDay)] || Content.hints[1] };
}

// Пожелание зависит от состояния и сдвигается каждый день, так подряд оно не повторяется.
const wishFor = (mood, date) => {
  const list = Content.wishes[mood];
  return list[Moon.dayIndex(date) % list.length];
};

const moonIcon = (phase, size) => {
  const s = size || 40;
  if (phase === 'new') return `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="#1C2442" stroke="#E8C872" stroke-width="2"/></svg>`;
  if (phase === 'full') return `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="#E8C872"/><circle cx="17" cy="18" r="3" fill="#D8B45A"/><circle cx="29" cy="30" r="4.5" fill="#D8B45A"/></svg>`;
  const d = phase === 'waxing' ? 'M24 3 A21 21 0 0 1 24 45 A12 21 0 0 0 24 3 Z' : 'M24 3 A21 21 0 0 0 24 45 A12 21 0 0 1 24 3 Z';
  return `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="none" stroke="#E8C872" stroke-width="2"/><path d="${d}" fill="#E8C872"/></svg>`;
};

// ---------- Экраны ----------

// Один экран дня: и «Сегодня», и любой день из календаря.
async function viewDay(iso) {
  const date = parseDate(iso);
  const isToday = iso === todayIso();
  const meta = dayMeta(date);
  const data = await loadDay(iso);
  const wd = date.getDay();
  const ritual = Content.rituals[meta.moon.phase];

  const moods = Content.moods.map((label, i) =>
    `<button type="button" class="mood m${i} ${data.mood === i ? 'on' : ''}" data-mood="${i}"><i></i>${label}</button>`).join('');

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
      <div class="cover-title">${isToday ? 'БлагоЛуна' : Content.weekdays[wd]}</div>
      ${moonIcon(meta.moon.phase, 44)}
    </header>
    <main class="page" data-day="${iso}">
      <section class="today-card">
        <span class="day-date">${isToday ? 'Сегодня, ' : ''}${date.getDate()} ${Content.monthsGen[date.getMonth()]}</span>
        <span class="day-sub">${Content.weekdays[wd]} · ${meta.moon.lunarDay}-й лунный день · ${Moon.PHASE_NAMES[meta.moon.phase]}</span>
        <span class="today-hint">${esc(meta.hint)}</span>
      </section>
      <section>
        <span class="eyebrow">${isToday ? 'Как ты сегодня?' : 'Как ты была в этот день?'}</span>
        <div class="moods">${moods}</div>
        <p class="wish" id="wish" ${data.mood === null ? 'hidden' : ''}>${data.mood === null ? '' : esc(wishFor(data.mood, date))}</p>
      </section>
      <section>
        <label class="eyebrow" for="f-text">Мой день одной строкой · по желанию</label>
        <input id="f-text" data-field="text" type="text" placeholder="Сегодня я…" value="${esc(data.text)}">
      </section>
      ${ritualBlock}${satBlock}${sunBlock}
      <p class="privacy" id="saved">🔒 ${PRIVACY}</p>
    </main>`;
}

async function viewCalendar(ym) {
  const now = new Date();
  const [y, m] = ym ? ym.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const first = new Date(y, m - 1, 1, 12);
  const daysIn = new Date(y, m, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const today = todayIso();
  const prev = m === 1 ? (y - 1) + '-12' : y + '-' + pad(m - 1);
  const next = m === 12 ? (y + 1) + '-01' : y + '-' + pad(m + 1);
  const moods = await monthMoods(y, m);
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span class="cell empty"></span>';
  for (let d = 1; d <= daysIn; d++) {
    const date = new Date(y, m - 1, d, 12);
    const info = Moon.info(date);
    const iso = isoDate(date);
    const mood = moods[iso];
    const cls = ['cell', info.phase === 'new' ? 'is-new' : '', info.phase === 'full' ? 'is-full' : '', mood !== undefined ? 'mood-' + mood : '', iso === today ? 'is-today' : ''].join(' ');
    const mark = info.phase === 'new' || info.phase === 'full' ? moonIcon(info.phase, 14) : `<small>${info.lunarDay}</small>`;
    cells += `<a class="${cls}" href="#/day/${iso}"><b>${d}</b>${mark}</a>`;
  }
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
      <div class="weekdays"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div>
      <div class="calendar">${cells}</div>
      <div class="legend">${Content.moods.map((l, i) => `<span><i class="mood-${i}"></i>${l}</span>`).join('')}</div>
      <ul class="events">${evList}</ul>
      <p class="muted small">Клетка окрашивается, когда ты отмечаешь состояние. Маленькая цифра это лунный день. Время по твоему часовому поясу.</p>
    </main>`;
}

// Итог года: средний уровень, разброс и сравнение половин года.
function yearVerdict(all) {
  const vals = Object.keys(all).sort().map((k) => all[k]);
  if (vals.length < 14) return null;
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const avg = mean(vals);
  const sd = Math.sqrt(mean(vals.map((v) => (v - avg) * (v - avg))));
  const half = Math.floor(vals.length / 2);
  const share = (v) => vals.filter((x) => x === v).length / vals.length;
  let key;
  if (share(0) >= 0.35) key = 'quiet';
  else if (share(1) >= 0.35 || avg < 1.6) key = 'tired';
  else if (mean(vals.slice(half)) - mean(vals.slice(0, half)) >= 0.6) key = 'rise';
  else if (sd >= 1.3) key = 'swing';
  else if (avg >= 3.3) key = 'shine';
  else if (avg >= 2.6) key = 'warm';
  else key = 'even';
  return Content.verdicts[key];
}

function wheelSvg(values) {
  const n = Content.spheres.length, cx = 150, cy = 150, R = 105;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  let rings = '';
  for (let k = 1; k <= 5; k++) rings += `<polygon points="${Content.spheres.map((_, i) => pt(i, R * k / 5).join(',')).join(' ')}" fill="none" stroke="#E9E9E7"/>`;
  const shape = Content.spheres.map((_, i) => pt(i, R * (values[i] || 0) / 5).join(',')).join(' ');
  const labels = Content.spheres.map((name, i) => {
    const [x, y] = pt(i, R + 14);
    const anchor = x > cx + 5 ? 'start' : x < cx - 5 ? 'end' : 'middle';
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" font-size="12" fill="#6B6A66">${name}</text>`;
  }).join('');
  return `<svg viewBox="-50 10 400 280" class="wheel" role="img" aria-label="Колесо баланса">${rings}<polygon points="${shape}" fill="rgba(46,58,102,.18)" stroke="#2E3A66" stroke-width="2"/>${labels}</svg>`;
}

async function viewYear() {
  const now = new Date();
  const y = now.getFullYear();
  const [year, ...months] = await Promise.all([loadYear(y), ...Array.from({ length: 12 }, (_, i) => monthMoods(y, i + 1))]);
  const all = Object.assign({}, ...months);

  let rows = '';
  months.forEach((mm, mi) => {
    const daysIn = new Date(y, mi + 1, 0).getDate();
    let cells = '';
    for (let d = 1; d <= 31; d++) {
      const v = mm[y + '-' + pad(mi + 1) + '-' + pad(d)];
      cells += d > daysIn ? '<i class="px off"></i>' : `<i class="px ${v !== undefined ? 'mood-' + v : ''}"></i>`;
    }
    rows += `<div class="px-row"><span>${Content.months[mi].slice(0, 3)}</span>${cells}</div>`;
  });

  const marked = Object.keys(all).length;
  const counts = Content.moods.map((l, i) => `<span><i class="mood-${i}"></i>${l} <b>${Object.values(all).filter((v) => v === i).length}</b></span>`).join('');
  const verdict = yearVerdict(all);
  const verdictBlock = verdict
    ? `<div class="verdict"><span class="eyebrow">Твой год сейчас</span><b>${verdict.title}</b><p>${verdict.text}</p><p class="muted">💡 ${verdict.tip}</p></div>`
    : `<p class="muted small">Итог года появится, когда отметишь хотя бы 14 дней. Сейчас отмечено: ${marked}.</p>`;

  const wheelFilled = Object.keys(year.wheel).length === Content.spheres.length;
  const wheelInputs = Content.spheres.map((name, si) => {
    const dots = [1, 2, 3, 4, 5].map((v) =>
      `<button type="button" class="dot ${year.wheel[si] === v ? 'on' : ''}" data-sphere="${si}" data-val="${v}" aria-label="${name}: ${v}">${v}</button>`).join('');
    return `<div class="sphere"><span>${name}</span><div class="dots">${dots}</div></div>`;
  }).join('');

  const isDecember = now.getMonth() === 11;
  const letterBlock = isDecember && year.letter
    ? `<section class="plaque sat"><span class="eyebrow">Письмо себе, написанное раньше в этом году</span><p class="letter">${esc(year.letter)}</p></section>`
    : `<section>
        <label class="eyebrow" for="f-letter">Письмо себе в декабрь</label>
        <textarea id="f-letter" data-field="letter" rows="4" placeholder="Привет, я из начала года. Я надеюсь, что ты…">${esc(year.letter)}</textarea>
        <p class="muted small">1 декабря письмо появится здесь, и ты сможешь его перечитать.</p>
      </section>`;

  return `
    <header class="cover small"><div class="cover-title">Мой ${y}</div></header>
    <main class="page" data-year="${y}">
      ${isDecember ? letterBlock : ''}
      <section>
        <label class="eyebrow" for="f-sankalpa">Санкальпа · намерение года</label>
        <input id="f-sankalpa" data-field="sankalpa" type="text" placeholder="Я живу бережно и в своём ритме…" value="${esc(year.sankalpa)}">
      </section>

      <section>
        <span class="eyebrow">Год в пикселях</span>
        <div class="pixels">${rows}</div>
        <div class="legend counts">${counts}</div>
      </section>
      ${verdictBlock}

      <section>
        <span class="eyebrow">Колесо баланса · с чего я начинаю</span>
        ${wheelSvg(year.wheel)}
        <p class="muted small">${wheelFilled ? 'Это твоя точка отсчёта. Оценки можно поправить ниже.' : 'Оцени каждую сферу от 1 до 5, и колесо нарисуется.'}</p>
        <div class="spheres">${wheelInputs}</div>
      </section>

      ${isDecember ? '' : letterBlock}
      <a class="channel" href="${Content.channelUrl}" data-external>Больше о Луне и ритуалах в нашем канале <span>›</span></a>
      <p class="privacy" id="saved">🔒 ${PRIVACY}</p>
    </main>`;
}

// ---------- Сохранение ввода ----------

// Экран #app один на всё приложение, поэтому слушатели прошлого экрана снимаем при переходе.
let binding = null;

function bindForm(root, load, save, onChange) {
  if (binding) binding.abort();
  binding = new AbortController();
  const opts = { signal: binding.signal };
  let data = null;
  const ready = load().then((d) => { data = d; });
  let timer = null;
  const persist = () => { clearTimeout(timer); timer = setTimeout(() => save(data), 400); };

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
      if (data.wheel[si] === v) delete data.wheel[si]; else data.wheel[si] = v;
      root.querySelectorAll(`[data-sphere="${si}"]`).forEach((x) => x.classList.toggle('on', Number(x.dataset.val) === data.wheel[si]));
    } else return;
    haptic();
    if (onChange) onChange(data);
    persist();
  }, opts);

  root.addEventListener('input', async (e) => {
    await ready;
    const t = e.target;
    if (t.dataset.field) data[t.dataset.field] = t.value;
    else if (t.dataset.refl !== undefined) data.reflection[Number(t.dataset.refl)] = t.value;
    else return;
    persist();
  }, opts);
}

function bindDay(root, iso) {
  const date = parseDate(iso);
  bindForm(root, () => loadDay(iso), (d) => saveDay(iso, d), (d) => {
    const w = document.getElementById('wish');
    if (!w) return;
    w.hidden = d.mood === null;
    w.textContent = d.mood === null ? '' : wishFor(d.mood, date);
  });
}

function bindYear(root, y) {
  bindForm(root, () => loadYear(y), (d) => saveYear(y, d), (d) => {
    const old = root.querySelector('.wheel');
    if (old) old.outerHTML = wheelSvg(d.wheel);
  });
}

// ---------- Навигация ----------

const app = document.getElementById('app');
const tabs = document.querySelectorAll('.tabbar a');

async function route() {
  const hash = location.hash || '#/today';
  const [, name, arg] = hash.split('/');
  const dayIso = name === 'day' && arg ? arg : todayIso();
  if (name === 'calendar') app.innerHTML = await viewCalendar(arg);
  else if (name === 'year') app.innerHTML = await viewYear();
  else app.innerHTML = await viewDay(dayIso);
  window.scrollTo(0, 0);
  const tab = name === 'day' ? 'calendar' : (name || 'today');
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  if (name === 'year') bindYear(app, new Date().getFullYear());
  else if (name !== 'calendar') bindDay(app, dayIso);
  else if (binding) binding.abort();
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
