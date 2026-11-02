// Фазы Луны по Миусу (Astronomical Algorithms, гл. 49), точность порядка минут.
// Все даты возвращаются как Date, поэтому показываются в часовом поясе телефона.
const Moon = (() => {
  const RAD = Math.PI / 180;

  function phaseJDE(k) {
    const T = k / 1236.85;
    const jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T;
    const M = (2.5534 + 29.1053567 * k) * RAD;
    const Mp = (201.5643 + 385.81693528 * k) * RAD;
    const F = (160.7108 + 390.67050284 * k) * RAD;
    const isNew = Math.abs(k - Math.floor(k)) < 0.01;
    const c = isNew
      ? -0.4072 * Math.sin(Mp) + 0.17241 * Math.sin(M) + 0.01608 * Math.sin(2 * Mp) + 0.01039 * Math.sin(2 * F) + 0.00739 * Math.sin(Mp - M) - 0.00514 * Math.sin(Mp + M)
      : -0.40614 * Math.sin(Mp) + 0.17302 * Math.sin(M) + 0.01614 * Math.sin(2 * Mp) + 0.01043 * Math.sin(2 * F) + 0.00734 * Math.sin(Mp - M) - 0.00515 * Math.sin(Mp + M);
    return jde + c;
  }

  const jdToDate = (jd) => new Date((jd - 2440587.5) * 86400000);

  // Порядковый номер локального дня, чтобы сравнивать даты без времени.
  const dayIndex = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);

  const cache = {};
  function events(year) {
    if (cache[year]) return cache[year];
    const list = [];
    const k0 = Math.floor((year - 2000) * 12.3685) - 2;
    for (let i = 0; i < 17; i++) {
      list.push({ type: 'new', date: jdToDate(phaseJDE(k0 + i)) });
      list.push({ type: 'full', date: jdToDate(phaseJDE(k0 + i + 0.5)) });
    }
    list.sort((a, b) => a.date - b.date);
    cache[year] = list;
    return list;
  }

  // Лунный день считаем от календарной даты новолуния: день новолуния = 1-й.
  function info(date) {
    const idx = dayIndex(date);
    const list = events(date.getFullYear());
    let lastNew = null, lastFull = null, isNew = false, isFull = false;
    for (const e of list) {
      const ei = dayIndex(e.date);
      if (ei > idx) break;
      if (e.type === 'new') { lastNew = e; if (ei === idx) isNew = true; }
      else { lastFull = e; if (ei === idx) isFull = true; }
    }
    const lunarDay = lastNew ? idx - dayIndex(lastNew.date) + 1 : null;
    const waxing = lastNew && (!lastFull || lastNew.date > lastFull.date);
    const phase = isNew ? 'new' : isFull ? 'full' : waxing ? 'waxing' : 'waning';
    const event = isNew ? lastNew : isFull ? lastFull : null;
    return { lunarDay, phase, eventTime: event ? event.date : null };
  }

  const PHASE_NAMES = { new: 'Новолуние', full: 'Полнолуние', waxing: 'Растущая Луна', waning: 'Убывающая Луна' };

  return { info, events, dayIndex, PHASE_NAMES };
})();
