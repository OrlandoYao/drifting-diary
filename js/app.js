/* ============================================
   app.js — 主逻辑：数据加载、签名墙、便签墙分组、筛选
   ============================================ */

// 全局状态
const App = {
  pages: [],           // 所有页面数据
  diaryPages: [],      // 排除名字录的日记页
  signaturePage: null, // 名字节（第一页）
  filteredPages: [],   // 筛选后
  authors: [],         // 所有真实作者（排除名字录）
  authorGroups: {},    // 按作者分组 { author: [pages...] }
  config: {},          // 配置
  currentView: 'wall', // 当前视图
  expandedAuthors: new Set(), // 展开的作者
  selectedColor: 'yellow',   // 当前选中的便签颜色
};

// ── 初始化 ──
async function init() {
  try {
    const configResp = await fetch('data/config.json', { cache: 'no-store' });
    App.config = await configResp.json();

    // 配置就绪后再初始化 Supabase（detail.js 的 DOMContentLoaded 执行太早，此时 config 尚未加载）
    if (typeof Detail !== 'undefined' && Detail.initSupabase) Detail.initSupabase();

    const pagesResp = await fetch('data/pages.json', { cache: 'no-store' });
    App.pages = await pagesResp.json();

    // 分离名字录和日记页
    App.signaturePage = App.pages.find(p => p.author === '名字录' || p.page === 1);
    App.diaryPages = App.pages.filter(p => p !== App.signaturePage);

    // 提取真实作者（排除名字录），按第一次出现的书写顺序
    App.authors = [];
    const seenAuthors = new Set();
    App.diaryPages.forEach(p => {
      if (!seenAuthors.has(p.author)) {
        seenAuthors.add(p.author);
        App.authors.push(p.author);
      }
    });

    // 按作者分组
    App.authorGroups = {};
    App.authors.forEach(a => {
      App.authorGroups[a] = App.diaryPages.filter(p => p.author === a);
    });

    // 更新标题
    document.title = App.config.title || '漂流日记本';
    document.querySelector('.brand-title').textContent = App.config.title || '漂流日记本';
    document.getElementById('subtitle').textContent = App.config.subtitle || '';

    // 填充作者下拉
    const sel = document.getElementById('filter-author');
    App.authors.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      sel.appendChild(opt);
    });

    // 更新页脚统计
    document.getElementById('total-pages').textContent = App.diaryPages.length;
    document.getElementById('total-authors').textContent = App.authors.length;

    // 渲染留言墙入口 + 名字节缩略图 + 便签预览
    if (App.signaturePage) {
      document.getElementById('message-wall-entry').style.display = 'block';
      document.getElementById('message-roster-img').src = getThumbPath(App.signaturePage.page);
      if (typeof Detail !== 'undefined' && Detail.updateMessageEntryCount) {
        Detail.updateMessageEntryCount();
      }
    }

    // 渲染封面 Hero
    renderHero();

    // 先构建作者配色，再渲染作者索引
    if (typeof PageGrid !== 'undefined') PageGrid.buildAuthorColors();

    // 渲染作者索引
    renderAuthorIndex();

    // 初始化日历和旅程线
    if (typeof Calendar !== 'undefined' && Calendar.init) Calendar.init();
    if (typeof Journey !== 'undefined' && Journey.init) Journey.init();

    // 初始渲染
    App.filteredPages = [...App.diaryPages];
    renderWall();

    // 检查 Supabase 配置
    if (!App.config.supabase || !App.config.supabase.url) {
      // 评论用 localStorage 降级
    }

    bindEvents();
  } catch (err) {
    console.error('初始化失败:', err);
    document.getElementById('wall-groups').innerHTML =
      '<p class="empty-state">数据加载失败，请确保通过 HTTP 服务器打开（不能直接双击 HTML 文件）。</p>';
  }
}

// ── 图片路径 ──
function getThumbPath(page) {
  return `${App.config.imageBase || 'images'}/thumb/page-${String(page).padStart(3, '0')}.jpg`;
}
function getFullPath(page) {
  return `${App.config.imageBase || 'images'}/full/page-${String(page).padStart(3, '0')}.jpg`;
}

// ── 封面 Hero：名字录作为日记本封面 ──
function renderHero() {
  if (!App.signaturePage) return;
  document.getElementById('hero').style.display = 'block';
  document.getElementById('hero-cover-img').src = getFullPath(App.signaturePage.page);
  document.getElementById('hero-title').textContent = App.config.title || '漂流日记本';
  document.getElementById('hero-sub').textContent = App.config.subtitle || '';

  // 统计：页数 · 城市数 · 时间跨度
  const cities = [...new Set(App.diaryPages.map(p => p.location).filter(Boolean))];
  const dates = App.diaryPages.map(p => p.date).filter(Boolean).sort();
  let stats = `${App.diaryPages.length} 页日记`;
  if (cities.length) stats += ` · 途经 ${cities.length} 座城市`;
  if (dates.length) {
    const f = d => { const t = new Date(d); return `${t.getFullYear()}.${t.getMonth() + 1}`; };
    stats += ` · ${f(dates[0])} - ${f(dates[dates.length - 1])}`;
  }
  document.getElementById('hero-stats').textContent = stats;

  document.getElementById('hero-cover').addEventListener('click', () => {
    if (typeof Detail !== 'undefined') Detail.openPageDetail(App.signaturePage.page);
  });
  document.getElementById('hero-open-book').addEventListener('click', () => {
    switchView('wall');
    const groups = document.getElementById('wall-groups');
    if (groups) groups.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('hero-open-wall').addEventListener('click', () => {
    switchView('wall');
    const entry = document.getElementById('message-wall-entry');
    if (entry) entry.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

// ── 留言墙入口：预览最近 3 张便签 ──
async function renderMessageWallPreview() {
  const box = document.getElementById('wall-board-notes');
  if (!box || typeof Detail === 'undefined') return;
  const all = (typeof Detail.fetchAllComments === 'function')
    ? await Detail.fetchAllComments()
    : [];
  const notes = all.slice(0, 3);
  const rots = [-2.5, 1.8, -1.2];

  if (!notes.length) {
    box.innerHTML = '<p class="wall-board-empty">墙上还空着～去任意一页贴张便签吧 ✍️</p>';
    return;
  }

  box.innerHTML = notes.map((c, i) => {
    const pageData = App.pages.find(p => p.page === c.page);
    const author = pageData && pageData.author !== '名字录' ? pageData.author : '';
    return Detail.noteHtml(c, `第${c.page}页${author ? ' · ' + author : ''}`, rots[i % 3]);
  }).join('');

  // 预览便签：点击跳转对应页，悬停可编辑/删除
  Detail.bindNoteEvents(box, (page) => {
    Detail.openPageDetail(page);
  });
}

// ── 作者索引导航：彩色进度条（每段一个作者色块） ──
function renderAuthorIndex() {
  const nav = document.getElementById('author-index');
  if (!nav || App.authors.length === 0) return;

  nav.style.display = 'flex';
  nav.innerHTML = App.authors.map(author => {
    const color = getAuthorColor(author);
    return `
      <button class="author-seg" data-author="${author}" title="${author}" style="background:${color};">
        <span class="author-seg-name">${author}</span>
      </button>`;
  }).join('');

  nav.querySelectorAll('.author-seg').forEach(seg => {
    seg.addEventListener('click', () => {
      const author = seg.dataset.author;
      // 确保该作者分组存在且已展开
      App.expandedAuthors.add(author);

      // 如果有筛选，先清除
      document.getElementById('filter-author').value = '';
      App.filteredPages = [...App.diaryPages];

      renderWall();

      // 滚动到对应分组
      setTimeout(() => {
        const group = document.querySelector(`.author-group[data-author="${author}"]`);
        if (group) {
          group.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    });
  });
}

// ── 便签墙渲染：按作者分组 + 折叠 ──
async function renderWall() {
  const container = document.getElementById('wall-groups');
  const empty = document.getElementById('empty-state');

  if (App.filteredPages.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  // 如果筛选了特定作者，只显示该作者的卡片
  const filterAuthor = document.getElementById('filter-author').value;

  // 重新分组
  let groups = {};
  if (filterAuthor) {
    groups[filterAuthor] = App.filteredPages.filter(p => p.author === filterAuthor);
  } else {
    App.authors.forEach(a => {
      const pages = App.filteredPages.filter(p => p.author === a);
      if (pages.length > 0) groups[a] = pages;
    });
  }

  const groupNames = Object.keys(groups);

  // 汇总所有便签，用于按作者展示
  const allComments = (typeof Detail !== 'undefined' && Detail.fetchAllComments)
    ? await Detail.fetchAllComments()
    : [];

  container.innerHTML = groupNames.map(author => {
    const pages = groups[author];
    const isExpanded = App.expandedAuthors.has(author);
    const coverPage = pages[0]; // 封面页（第一页）
    const extraCount = pages.length - 1;

    // 封面卡片 + 叠加效果
    const stackedCount = isExpanded ? 0 : Math.min(extraCount, 3);

    // 该作者收到的留言贴
    const pageSet = new Set(pages.map(p => p.page));
    const authorComments = allComments.filter(c => pageSet.has(c.page));
    const notesHtml = authorComments.length
      ? `<div class="author-notes" data-author-notes="${author}">${authorComments.map((c, i) =>
          Detail.noteHtml(c, `第${c.page}页`, ((i * 37) % 7 - 3) * 0.6)).join('')}</div>`
      : '';

    return `
      <div class="author-group ${isExpanded ? 'expanded' : ''}" data-author="${author}">
        <div class="group-header">
          <span class="group-author-name" style="background:${getAuthorColor(author)}">${author}</span>
          <span class="group-count">${pages.length} 页</span>
          ${extraCount > 0 ? `<span class="group-toggle">${isExpanded ? '收起' : `展开 ${extraCount} 页`}</span>` : ''}
        </div>
        ${notesHtml}
        <div class="group-cards">
          ${isExpanded
            ? pages.map((p, i) => renderCard(p, App.filteredPages.indexOf(p), i)).join('')
            : renderStackedCard(coverPage, App.filteredPages.indexOf(coverPage), stackedCount, pages.slice(1))
          }
        </div>
      </div>
    `;
  }).join('');

  // 绑定点击事件
  container.querySelectorAll('.wall-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // 如果是展开/收起点击，不触发详情
      if (e.target.closest('.group-header') || e.target.closest('.group-toggle')) return;
      const idx = parseInt(card.dataset.index);
      if (!isNaN(idx)) Detail.open(idx);
    });
  });

  // 分组留言贴：点击跳转对应页，悬停可编辑/删除
  container.querySelectorAll('.author-notes').forEach(notesBox => {
    Detail.bindNoteEvents(notesBox, (page) => {
      Detail.openPageDetail(page);
    });
  });

  // 绑定展开/收起
  container.querySelectorAll('.author-group').forEach(group => {
    const header = group.querySelector('.group-header');
    if (header) {
      header.addEventListener('click', () => {
        const author = group.dataset.author;
        if (App.expandedAuthors.has(author)) {
          App.expandedAuthors.delete(author);
        } else {
          App.expandedAuthors.add(author);
        }
        renderWall();
      });
    }

    // 点击叠加层也展开
    const stacked = group.querySelector('.stacked-card');
    if (stacked) {
      stacked.addEventListener('click', (e) => {
        e.stopPropagation();
        const author = group.dataset.author;
        App.expandedAuthors.add(author);
        renderWall();
      });
    }
  });
}

// 渲染单张卡片
function renderCard(p, globalIndex, localIndex) {
  return `
    <div class="wall-card" data-index="${globalIndex}" data-page="${p.page}" style="--card-rot: ${(localIndex % 3 - 1) * 1.5}deg;">
      <img class="wall-card-img loading"
           src="${getThumbPath(p.page)}"
           alt="第${p.page}页"
           loading="lazy"
           onload="this.classList.remove('loading')"
           onerror="this.classList.remove('loading');this.src='${getFullPath(p.page)}'">
      <div class="wall-card-body">
        <div class="wall-card-date">${p.dateText || formatDate(p.date)}${p.location ? ' · ' + p.location : ''}</div>
        <div class="wall-card-author">${p.author}</div>
        <div class="wall-card-signature" data-author="${p.author}"></div>
      </div>
      <span class="wall-card-page">第 ${p.page} 页</span>
    </div>
  `;
}

// 渲染叠加卡片（折叠状态）
function renderStackedCard(coverPage, globalIndex, stackCount, hiddenPages) {
  const stacks = stackCount > 0
    ? Array.from({ length: stackCount }, (_, i) =>
        `<div class="stack-shadow" style="--stack-i: ${i + 1};"></div>`
      ).join('')
    : '';

  return `
    <div class="stacked-card" data-index="${globalIndex}" data-page="${coverPage.page}">
      ${stacks}
      <div class="wall-card" data-index="${globalIndex}" data-page="${coverPage.page}" style="--card-rot: 0deg;">
        <img class="wall-card-img loading"
             src="${getThumbPath(coverPage.page)}"
             alt="第${coverPage.page}页"
             loading="lazy"
             onload="this.classList.remove('loading')"
             onerror="this.classList.remove('loading');this.src='${getFullPath(coverPage.page)}'">
        <div class="wall-card-body">
          <div class="wall-card-date">${coverPage.dateText || formatDate(coverPage.date)}${coverPage.location ? ' · ' + coverPage.location : ''}</div>
          <div class="wall-card-author">${coverPage.author}</div>
          <div class="wall-card-signature" data-author="${coverPage.author}"></div>
        </div>
        <span class="wall-card-page">第 ${coverPage.page} 页</span>
      </div>
      ${stackCount > 0 ? `<div class="stack-badge">+${stackCount}</div>` : ''}
    </div>
  `;
}

// ── 视图切换 ──
const VIEW_SECTIONS = { wall: 'view-wall', calendar: 'view-calendar', journey: 'view-journey' };

function switchView(view) {
  App.currentView = view;
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  Object.values(VIEW_SECTIONS).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', VIEW_SECTIONS[view] === id);
  });

  if (view === 'calendar' && typeof Calendar !== 'undefined') {
    Calendar.render();
  }
  if (view === 'journey' && typeof Journey !== 'undefined') {
    Journey.render();
  }

  // Hero 封面只在留言墙显示
  const hero = document.getElementById('hero');
  if (hero) hero.style.display = (view === 'wall') ? 'block' : 'none';
}

// ── 筛选 ──
function applyFilter() {
  const author = document.getElementById('filter-author').value;

  App.filteredPages = author
    ? App.diaryPages.filter(p => p.author === author)
    : [...App.diaryPages];

  // 重置展开状态
  App.expandedAuthors.clear();

  renderWall();
}

// ── 清除筛选 ──
function clearFilter() {
  document.getElementById('filter-author').value = '';
  App.filteredPages = [...App.diaryPages];
  App.expandedAuthors.clear();
  renderWall();
}

// ── 页码跳转 ──
function jumpToPage(pageNum) {
  // 在全部页面（含名字录）中查找
  const target = App.pages.find(p => p.page === pageNum);
  if (!target) return;

  // 清除筛选，重置为全部页面
  document.getElementById('filter-author').value = '';
  App.filteredPages = [...App.diaryPages];
  App.expandedAuthors.clear();

  // 如果是名字录，打开详情
  if (target === App.signaturePage) {
    App.filteredPages = [App.signaturePage, ...App.diaryPages];
    Detail.open(0);
    return;
  }

  // 切到留言墙视图
  switchView('wall');

  // 展开该作者分组，滚动到对应卡片
  App.expandedAuthors.add(target.author);
  renderWall();
  setTimeout(() => {
    const card = document.querySelector(`.wall-card[data-page="${pageNum}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.animation = 'cardHighlight 1.5s ease';
    }
  }, 100);
}

// ── 日期跳转：跳到该日期最近的一页 ──
function jumpToDate(dateStr) {
  const target = new Date(dateStr).getTime();
  let closest = null;
  let minDiff = Infinity;
  App.diaryPages.forEach(p => {
    if (!p.date) return;
    const diff = Math.abs(new Date(p.date).getTime() - target);
    if (diff < minDiff) {
      minDiff = diff;
      closest = p;
    }
  });
  if (closest) jumpToPage(closest.page);
}

// ── 事件绑定 ──
function bindEvents() {
  document.getElementById('btn-wall').addEventListener('click', () => switchView('wall'));
  document.getElementById('btn-calendar').addEventListener('click', () => switchView('calendar'));
  document.getElementById('btn-journey').addEventListener('click', () => switchView('journey'));

  document.getElementById('filter-author').addEventListener('change', applyFilter);
  document.getElementById('filter-clear').addEventListener('click', clearFilter);

  // 跳转面板
  document.getElementById('jump-btn').addEventListener('click', () => {
    document.getElementById('jump-overlay').classList.add('active');
  });
  document.getElementById('jump-close').addEventListener('click', closeJumpPanel);
  document.getElementById('jump-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'jump-overlay') closeJumpPanel();
  });
  document.getElementById('jump-confirm').addEventListener('click', () => {
    const date = document.getElementById('jump-date').value;
    const num = parseInt(document.getElementById('jump-num').value);
    if (num >= 1 && num <= 97) {
      closeJumpPanel();
      jumpToPage(num);
    } else if (date) {
      closeJumpPanel();
      jumpToDate(date);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('jump-overlay').classList.contains('active')) {
      closeJumpPanel();
    }
  });

  // 留言墙入口点击 → 打开留言墙弹层（点便签本身除外）
  const msgEntry = document.getElementById('message-wall-entry');
  if (msgEntry) {
    msgEntry.addEventListener('click', (e) => {
      if (e.target.closest('.sticky-note')) return;
      Detail.openMessageWall();
    });
  }
}

// ── 关闭跳转面板 ──
function closeJumpPanel() {
  document.getElementById('jump-overlay').classList.remove('active');
  document.getElementById('jump-date').value = '';
  document.getElementById('jump-num').value = '';
}

// ── 工具函数 ──
function getAuthorColor(author) {
  return (typeof PageGrid !== 'undefined' && PageGrid.authorColors && PageGrid.authorColors[author])
    || '#a09383';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 启动
document.addEventListener('DOMContentLoaded', init);
