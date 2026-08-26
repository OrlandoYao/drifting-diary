/* ============================================
   journey.js — 旅程视图：地点时间线（抽象旅程线）
   ============================================ */

const Journey = {
  segments: [],
  expanded: new Set(),

  // 按页码顺序把连续同地点的页聚成一段
  init() {
    this.segments = [];
    App.diaryPages.forEach(p => {
      const loc = p.location || '漂流途中';
      const last = this.segments[this.segments.length - 1];
      if (last && last.location === loc) {
        last.pages.push(p);
      } else {
        this.segments.push({ location: loc, pages: [p] });
      }
    });
    this.expanded.clear();
  },

  // 段落日期范围文本
  segDateText(seg) {
    const all = [];
    seg.pages.forEach(p => {
      (p.dates && p.dates.length ? p.dates : (p.date ? [p.date] : [])).forEach(d => all.push(d));
    });
    if (!all.length) return '';
    all.sort();
    const fmt = iso => {
      const d = new Date(iso);
      return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
    };
    return all[0] === all[all.length - 1] ? fmt(all[0]) : `${fmt(all[0])} ~ ${fmt(all[all.length - 1])}`;
  },

  render() {
    const timeline = document.getElementById('journey-timeline');
    const summary = document.getElementById('journey-summary');

    const cities = [...new Set(this.segments.map(s => s.location))];
    summary.textContent = `这本日记漂流了 ${this.segments.length} 段旅程，途经 ${cities.length} 个地方`;

    timeline.innerHTML = this.segments.map((seg, i) => {
      const first = seg.pages[0];
      const last = seg.pages[seg.pages.length - 1];
      const pageRange = first.page === last.page
        ? `第${first.page}页`
        : `第${first.page}-${last.page}页`;
      const isExpanded = this.expanded.has(i);

      return `
        <div class="journey-node ${isExpanded ? 'expanded' : ''}" data-seg="${i}">
          <div class="jn-head">
            <span class="jn-dot"></span>
            <span class="jn-loc">${seg.location}</span>
            <span class="jn-meta">${this.segDateText(seg)} · ${pageRange} · ${seg.pages.length}页</span>
            <span class="jn-toggle">${isExpanded ? '收起' : '展开'}</span>
          </div>
          <div class="jn-pages">
            ${seg.pages.map(p => `
              <button class="jn-page" data-page="${p.page}">
                <img src="${getThumbPath(p.page)}" alt="第${p.page}页" loading="lazy"
                     onerror="this.src='${getFullPath(p.page)}'">
                <span class="jnp-info">
                  <span class="jnp-num">第${p.page}页</span>
                  <span class="jnp-author" style="color:${PageGrid.authorColors[p.author] || '#a09383'}">${p.author}</span>
                  <span class="jnp-date">${p.dateText || ''}</span>
                </span>
              </button>`).join('')}
          </div>
        </div>`;
    }).join('');

    // 展开/收起
    timeline.querySelectorAll('.jn-head').forEach(head => {
      head.addEventListener('click', () => {
        const i = parseInt(head.closest('.journey-node').dataset.seg);
        if (this.expanded.has(i)) this.expanded.delete(i);
        else this.expanded.add(i);
        this.render();
      });
    });

    // 打开页面详情
    timeline.querySelectorAll('.jn-page').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        Detail.openPageDetail(parseInt(btn.dataset.page));
      });
    });
  }
};
