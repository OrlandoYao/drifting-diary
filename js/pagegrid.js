/* ============================================
   pagegrid.js — 共用页码网格跳转弹层
   用法：PageGrid.open(当前页码, 选中回调)
   ============================================ */

const PageGrid = {
  onSelect: null,

  // 作者配色（与日历/旅程线共用，17 色区分；姚雨馨/况旭彤固定色）
  palette: [
    '#d96b4a', // 珊瑚红
    '#e8993a', // 橙
    '#d9b23f', // 金黄
    '#9cb846', // 黄绿
    '#5fae7a', // 绿
    '#3d9d8f', // 青绿
    '#4aa8d4', // 天蓝
    '#6b8fc4', // 灰蓝
    '#7d6ad4', // 靛紫
    '#c0509c', // 紫粉
    '#d46a9a', // 粉
    '#c94f77', // 玫红
    '#a06a4d', // 棕
    '#7d8a4a', // 橄榄绿
    '#5a7d9c', // 蓝灰
    '#8f6bb0', // 薰衣草
    '#a8325f'  // 酒红
  ],

  // 固定色：姚雨馨紫、况旭彤蓝
  fixedColors: {
    '姚雨馨': '#8e4fd4',
    '况旭彤': '#3b7dd8'
  },

  authorColors: {},

  buildAuthorColors() {
    this.authorColors = {};
    const used = new Set(Object.values(this.fixedColors));
    let i = 0;
    App.authors.forEach(a => {
      if (this.fixedColors[a]) {
        this.authorColors[a] = this.fixedColors[a];
      } else {
        let color;
        do {
          color = this.palette[i % this.palette.length];
          i++;
        } while (used.has(color));
        used.add(color);
        this.authorColors[a] = color;
      }
    });
  },

  open(currentPage, onSelect) {
    this.onSelect = onSelect;
    this.buildAuthorColors();

    const grid = document.getElementById('page-grid');

    grid.innerHTML = App.pages.map(p => {
      const isRoster = p === App.signaturePage;
      const isCurrent = p.page === currentPage;
      const color = this.authorColors[p.author] || '#a09383';
      return `
        <button class="page-cell ${isCurrent ? 'current' : ''} ${isRoster ? 'roster' : ''}"
                data-page="${p.page}"
                style="--cell-color: ${color};"
                title="${isRoster ? '名字录' : (p.author || '')}">
          <span class="pc-num">${p.page}</span>
          <span class="pc-dot"></span>
        </button>`;
    }).join('');

    grid.querySelectorAll('.page-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const page = parseInt(cell.dataset.page);
        this.close();
        if (this.onSelect) this.onSelect(page);
      });
    });

    // 当前页滚动到可视区
    const cur = grid.querySelector('.page-cell.current');
    if (cur) cur.scrollIntoView({ block: 'center' });

    document.getElementById('page-grid-overlay').classList.add('active');
  },

  close() {
    document.getElementById('page-grid-overlay').classList.remove('active');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('page-grid-close').addEventListener('click', () => PageGrid.close());
  document.getElementById('page-grid-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'page-grid-overlay') PageGrid.close();
  });
  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('page-grid-overlay');
    if (e.key === 'Escape' && overlay.classList.contains('active')) {
      PageGrid.close();
    }
  });
});
