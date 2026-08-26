/* ============================================
   calendar.js — 日历视图：按月展示，有日记的日期高亮
   ============================================ */

const Calendar = {
  year: 2025,
  month: 3, // 0-based
  dateMap: {}, // 'YYYY-MM-DD' -> [page...]

  // 构建日期 → 页面 映射
  init() {
    this.dateMap = {};
    App.diaryPages.forEach(p => {
      const dates = p.dates && p.dates.length ? p.dates : (p.date ? [p.date] : []);
      dates.forEach(d => {
        const k = d.slice(0, 10);
        (this.dateMap[k] = this.dateMap[k] || []).push(p);
      });
    });

    // 定位到第一篇日记所在月份
    const first = App.diaryPages.map(p => p.date).filter(Boolean).sort()[0];
    if (first) {
      const d = new Date(first);
      this.year = d.getFullYear();
      this.month = d.getMonth();
    }

    const prev = document.getElementById('cal-prev');
    const next = document.getElementById('cal-next');
    if (prev) prev.addEventListener('click', () => this.shiftMonth(-1));
    if (next) next.addEventListener('click', () => this.shiftMonth(1));
  },

  shiftMonth(delta) {
    let m = this.month + delta;
    let y = this.year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    this.month = m;
    this.year = y;
    this.render();
  },

  render() {
    document.getElementById('cal-title').textContent =
      `${this.year}年${this.month + 1}月`;

    const grid = document.getElementById('cal-grid');
    const firstDay = new Date(this.year, this.month, 1);
    const startWeekday = firstDay.getDay(); // 周日=0
    const daysInMonth = new Date(this.year, this.month + 1, 0).getDate();

    let html = '';
    // 前置空白
    for (let i = 0; i < startWeekday; i++) {
      html += '<div class="cal-cell cal-blank"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${this.year}-${String(this.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const pages = this.dateMap[key];
      const dots = pages
        ? [...new Set(pages.map(p => PageGrid.authorColors[p.author] || '#c47b3a'))]
            .slice(0, 4).map(c => `<span class="cal-dot" style="background:${c}"></span>`).join('')
        : '';
      html += `
        <div class="cal-cell ${pages ? 'cal-has' : ''}" data-date="${key}">
          <span class="cal-daynum">${day}</span>
          <span class="cal-dots">${dots}</span>
        </div>`;
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.cal-cell.cal-has').forEach(cell => {
      cell.addEventListener('click', () => this.showDay(cell.dataset.date));
    });

    this.hideDayPanel();
  },

  showDay(key) {
    const panel = document.getElementById('cal-day-panel');
    const pages = this.dateMap[key] || [];
    if (!pages.length) return;

    const d = new Date(key);
    const title = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${pages.length} 篇日记`;

    panel.innerHTML = `
      <div class="cal-panel-title">${title}</div>
      <div class="cal-panel-list">
        ${pages.map(p => `
          <button class="cal-panel-item" data-page="${p.page}">
            <span class="cpi-num">第${p.page}页</span>
            <span class="cpi-author" style="color:${PageGrid.authorColors[p.author] || '#a09383'}">${p.author}</span>
            ${p.note ? `<span class="cpi-note">${p.note}</span>` : ''}
            <span class="cpi-arrow">→</span>
          </button>`).join('')}
      </div>`;

    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    panel.querySelectorAll('.cal-panel-item').forEach(item => {
      item.addEventListener('click', () => {
        Detail.openPageDetail(parseInt(item.dataset.page));
      });
    });
  },

  hideDayPanel() {
    const panel = document.getElementById('cal-day-panel');
    panel.style.display = 'none';
    panel.innerHTML = '';
  }
};
