/* ============================================
   detail.js — 详情层：图片缩放、贴纸评论系统
   ============================================ */

const Detail = {
  currentIndex: 0,
  scale: 1,
  isDragging: false,
  startX: 0,
  startY: 0,
  translateX: 0,
  translateY: 0,
  selectedColor: 'yellow',
  supabaseClient: null,   // 配置了 Supabase 才启用，否则降级 localStorage

  // 初始化
  init() {
    this.initSupabase();
    this.bindEvents();
  },

  // 初始化 Supabase（config 有 url/anonKey 才启用）
  initSupabase() {
    const sc = App.config.supabase;
    if (sc && sc.url && sc.anonKey && typeof supabase !== 'undefined') {
      try {
        this.supabaseClient = supabase.createClient(sc.url, sc.anonKey);
      } catch (e) {
        console.warn('Supabase 初始化失败，降级 localStorage:', e);
        this.supabaseClient = null;
      }
    }
  },

  // 读取某页便签（Supabase 优先，否则 localStorage）
  async fetchComments(page) {
    if (this.supabaseClient) {
      const { data, error } = await this.supabaseClient
        .from('comments')
        .select('id, page_id, name, content, color, created_at')
        .eq('page_id', page)
        .order('created_at', { ascending: true });
      if (error) { console.warn('加载便签失败:', error.message); return []; }
      return data.map(r => ({
        id: r.id,
        page: r.page_id,
        name: r.name,
        content: r.content,
        color: r.color || 'yellow',
        created_at: r.created_at
      }));
    }
    const key = `diary_sticky_${page}`;
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    return data.map(c => ({ ...c, id: c.id || c.created_at }));
  },

  // 汇总所有便签
  async fetchAllComments() {
    if (this.supabaseClient) {
      const { data, error } = await this.supabaseClient
        .from('comments')
        .select('id, page_id, name, content, color, created_at')
        .order('created_at', { ascending: false });
      if (error) { console.warn('加载留言失败:', error.message); return []; }
      return data.map(r => ({
        id: r.id,
        page: r.page_id,
        name: r.name,
        content: r.content,
        color: r.color || 'yellow',
        created_at: r.created_at
      }));
    }
    const all = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const m = key && key.match(/^diary_sticky_(\d+)$/);
      if (!m) continue;
      const page = parseInt(m[1]);
      let d;
      try { d = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { continue; }
      d.forEach(c => all.push({ ...c, page, id: c.id || c.created_at }));
    }
    all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return all;
  },

  // 打开详情层
  open(index) {
    this.currentIndex = index;
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.renderPage();
    this.loadComments();
    document.getElementById('overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  close() {
    document.getElementById('overlay').classList.remove('active');
    document.getElementById('overlay').classList.remove('fullscreen');
    document.body.style.overflow = '';
  },

  toggleFullscreen() {
    const overlay = document.getElementById('overlay');
    overlay.classList.toggle('fullscreen');
    // 退出全屏时重置缩放
    if (!overlay.classList.contains('fullscreen')) {
      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;
      this.applyTransform();
    }
  },

  // ── 留言墙 ──

  // 更新留言墙入口卡上的留言数 + 预览便签
  async updateMessageEntryCount() {
    const el = document.getElementById('message-entry-count');
    if (!el) return;
    const all = await this.fetchAllComments();
    el.textContent = all.length > 0 ? `已有 ${all.length} 条便签留言` : '大家贴在日记里的便签';
    if (typeof renderMessageWallPreview === 'function') renderMessageWallPreview();
  },

  // 打开留言墙弹层
  openMessageWall() {
    this.renderMessageWallContent();
    document.getElementById('message-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  // 渲染留言墙弹层内容（不打开弹层）
  async renderMessageWallContent() {
    const notes = await this.fetchAllComments();
    const wall = document.getElementById('message-notes');
    if (notes.length === 0) {
      wall.innerHTML = '<p class="sticky-note-empty">还没有留言，去任意一页贴张便签吧～</p>';
    } else {
      wall.innerHTML = notes.map((c, i) => {
        const pageData = App.pages.find(p => p.page === c.page);
        const author = pageData && pageData.author !== '名字录' ? pageData.author : '';
        return this.noteHtml(c, `第${c.page}页${author ? ' · ' + author : ''}`, ((i * 37) % 7 - 3) * 0.8);
      }).join('');
      this.bindNoteEvents(wall, (page) => {
        this.closeMessageWall();
        this.openPageDetail(page);
      });
    }
  },

  // 便签 HTML 模板（含操作按钮），供所有渲染处复用
  noteHtml(c, extraTime, rot) {
    return `
      <div class="sticky-note color-${c.color || 'yellow'}" data-page="${c.page}" data-id="${escapeHtml(c.id || c.created_at)}" style="--note-rot: ${rot || 0}deg;">
        <div class="note-actions">
          <button class="note-action note-edit" title="编辑">✎</button>
          <button class="note-action note-del" title="删除">×</button>
        </div>
        <div class="sn-name">${escapeHtml(c.name)}</div>
        <div class="sn-text">${escapeHtml(c.content)}</div>
        <div class="sn-time">${formatTime(c.created_at)}${extraTime ? ' · ' + extraTime : ''}</div>
      </div>`;
  },

  // 绑定便签事件（跳转/编辑/删除），供所有便签渲染处复用
  bindNoteEvents(container, onJump) {
    container.querySelectorAll('.sticky-note').forEach(note => {
      const page = parseInt(note.dataset.page);
      const id = note.dataset.id;

      // 点击便签 → 跳转（编辑态 / 操作按钮除外）
      note.addEventListener('click', (e) => {
        if (e.target.closest('.note-actions') || e.target.closest('.note-edit-form')) return;
        if (note.classList.contains('editing')) return;
        e.stopPropagation();
        if (onJump) onJump(page);
      });

      // 删除
      const delBtn = note.querySelector('.note-del');
      if (delBtn) delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteComment(page, id);
      });

      // 编辑（内联）
      const editBtn = note.querySelector('.note-edit');
      if (editBtn) editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startEditNote(note, page, id);
      });
    });
  },

  // 查找某页的某条便签（按 id）
  async findComment(page, id) {
    const data = await this.fetchComments(page);
    return data.find(c => (c.id || c.created_at) === id);
  },

  // 删除便签
  async deleteComment(page, id) {
    if (!confirm('确定删除这条便签吗？')) return;
    if (this.supabaseClient) {
      const { error } = await this.supabaseClient.from('comments').delete().eq('id', id);
      if (error) { alert('删除失败：' + error.message); return; }
    } else {
      const key = `diary_sticky_${page}`;
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      const next = data.filter(c => (c.id || c.created_at) !== id);
      localStorage.setItem(key, JSON.stringify(next));
    }
    this.refreshAfterNoteChange();
  },

  // 便签增删改后刷新所有展示区域（不改变弹层开合状态）
  refreshAfterNoteChange() {
    this.renderMessageWallContent();
    if (document.getElementById('overlay').classList.contains('active')) {
      this.loadComments();
    }
    if (typeof renderMessageWallPreview === 'function') renderMessageWallPreview();
    if (typeof renderWall === 'function') renderWall();
    this.updateMessageEntryCount();
  },

  // 进入内联编辑态
  async startEditNote(noteEl, page, id) {
    const c = await this.findComment(page, id);
    if (!c) return;
    noteEl.classList.add('editing');
    noteEl.querySelector('.sn-time').insertAdjacentHTML('afterend', `
      <div class="note-edit-form">
        <input class="note-edit-input" value="${escapeHtml(c.name)}" maxlength="20" placeholder="名字">
        <textarea class="note-edit-textarea" maxlength="200" rows="3" placeholder="留言内容">${escapeHtml(c.content)}</textarea>
        <div class="note-edit-btns">
          <button class="note-save">保存</button>
          <button class="note-cancel">取消</button>
        </div>
      </div>`);

    noteEl.querySelector('.note-save').addEventListener('click', (e) => {
      e.stopPropagation();
      const nameVal = noteEl.querySelector('.note-edit-input').value.trim();
      const textVal = noteEl.querySelector('.note-edit-textarea').value.trim();
      if (!nameVal || !textVal) {
        alert('名字和留言内容不能为空');
        return;
      }
      this.editComment(page, id, nameVal, textVal);
    });

    noteEl.querySelector('.note-cancel').addEventListener('click', (e) => {
      e.stopPropagation();
      this.refreshAfterNoteChange();
    });
  },

  // 保存编辑
  async editComment(page, id, newName, newContent) {
    if (this.supabaseClient) {
      const { error } = await this.supabaseClient
        .from('comments')
        .update({ name: newName, content: newContent })
        .eq('id', id);
      if (error) { alert('保存失败：' + error.message); return; }
    } else {
      const key = `diary_sticky_${page}`;
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      const c = data.find(item => (item.id || item.created_at) === id);
      if (c) {
        c.name = newName;
        c.content = newContent;
        localStorage.setItem(key, JSON.stringify(data));
      }
    }
    this.refreshAfterNoteChange();
  },

  closeMessageWall() {
    document.getElementById('message-overlay').classList.remove('active');
    // 只有详情层也关着时才恢复滚动
    if (!document.getElementById('overlay').classList.contains('active')) {
      document.body.style.overflow = '';
    }
  },

  // 跳转到某页详情（清筛选，名字录单独处理）
  openPageDetail(pageNum) {
    if (App.signaturePage && pageNum === App.signaturePage.page) {
      document.getElementById('filter-author').value = '';
      App.filteredPages = [App.signaturePage, ...App.diaryPages];
      this.open(0);
      return;
    }
    document.getElementById('filter-author').value = '';
    App.filteredPages = [...App.diaryPages];
    const idx = App.filteredPages.findIndex(p => p.page === pageNum);
    if (idx >= 0) this.open(idx);
  },

  renderPage() {
    const p = App.filteredPages[this.currentIndex];
    if (!p) return;

    document.getElementById('overlay-image').src = getFullPath(p.page);
    document.getElementById('overlay-pagenum').textContent =
      `${this.currentIndex + 1} / ${App.filteredPages.length}`;
    document.getElementById('meta-date').textContent = p.date ? '📅 ' + (p.dateText || formatDate(p.date)) : '';
    document.getElementById('meta-author').textContent = p.author ? '✍️ ' + p.author : '';
    document.getElementById('meta-signature').textContent = p.location ? '📍 ' + p.location : '';
    document.getElementById('meta-note').textContent = p.note || '';

    this.applyTransform();
  },

  prev() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;
      this.renderPage();
      this.loadComments();
    }
  },

  next() {
    if (this.currentIndex < App.filteredPages.length - 1) {
      this.currentIndex++;
      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;
      this.renderPage();
      this.loadComments();
    }
  },

  // ── 图片缩放与拖动 ──
  applyTransform() {
    const img = document.getElementById('overlay-image');
    img.style.transform =
      `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
  },

  zoom(delta, clientX, clientY) {
    const oldScale = this.scale;
    this.scale = Math.max(1, Math.min(5, this.scale + delta));
    if (this.scale === oldScale) return;

    if (clientX !== undefined) {
      const img = document.getElementById('overlay-image');
      const rect = img.getBoundingClientRect();
      const cx = clientX - rect.left - rect.width / 2;
      const cy = clientY - rect.top - rect.height / 2;
      const ratio = this.scale / oldScale;
      this.translateX = cx - (cx - this.translateX) * ratio;
      this.translateY = cy - (cy - this.translateY) * ratio;
    }

    this.applyTransform();
  },

  // ── 贴纸评论系统（localStorage） ──

  async loadComments() {
    const wall = document.getElementById('sticky-note-wall');
    const p = App.filteredPages[this.currentIndex];
    if (!p) return;

    const data = await this.fetchComments(p.page);

    if (data.length === 0) {
      wall.innerHTML = '<p class="sticky-note-empty">还没有便签，来贴第一张吧～</p>';
      return;
    }

    wall.innerHTML = data.map((c, i) => {
      return this.noteHtml(c, '', ((i * 37) % 7 - 3) * 0.8);
    }).join('');
    // 详情页便签不跳转，仅编辑/删除
    this.bindNoteEvents(wall, null);
  },

  async submitComment() {
    const name = document.getElementById('comment-name').value.trim();
    const text = document.getElementById('comment-text').value.trim();

    if (!name || !text) {
      alert('请填写名字和留言内容');
      return;
    }

    const p = App.filteredPages[this.currentIndex];
    const color = this.selectedColor;

    if (this.supabaseClient) {
      const { error } = await this.supabaseClient.from('comments').insert({
        page_id: p.page,
        name,
        content: text,
        color
      });
      if (error) { alert('留言失败：' + error.message); return; }
    } else {
      const key = `diary_sticky_${p.page}`;
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      data.push({
        id: new Date().toISOString() + '-' + Math.random().toString(36).slice(2, 6),
        name,
        content: text,
        color,
        created_at: new Date().toISOString()
      });
      localStorage.setItem(key, JSON.stringify(data));
    }

    document.getElementById('comment-text').value = '';
    this.loadComments();
    this.refreshAfterNoteChange();
  },

  // 事件绑定
  bindEvents() {
    document.getElementById('overlay-close').addEventListener('click', () => this.close());
    document.getElementById('overlay-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    document.getElementById('overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('overlay')) this.close();
    });

    document.getElementById('overlay-prev').addEventListener('click', () => this.prev());
    document.getElementById('overlay-next').addEventListener('click', () => this.next());

    // 页码网格跳转
    document.getElementById('overlay-grid').addEventListener('click', () => {
      const p = App.filteredPages[this.currentIndex];
      PageGrid.open(p ? p.page : 0, (page) => this.openPageDetail(page));
    });

    document.addEventListener('keydown', (e) => {
      // 页码网格打开时优先由它处理 Esc
      if (e.key === 'Escape' && document.getElementById('page-grid-overlay').classList.contains('active')) return;

      // 留言墙打开时 Esc 关闭留言墙
      const msgOverlay = document.getElementById('message-overlay');
      if (msgOverlay.classList.contains('active')) {
        if (e.key === 'Escape') this.closeMessageWall();
        return;
      }

      if (!document.getElementById('overlay').classList.contains('active')) return;
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'ArrowRight') this.next();
      if (e.key === 'Escape') {
        // 如果在全屏模式，先退出全屏
        if (document.getElementById('overlay').classList.contains('fullscreen')) {
          this.toggleFullscreen();
        } else {
          this.close();
        }
      }
    });

    // 留言墙弹层事件
    document.getElementById('message-close').addEventListener('click', () => this.closeMessageWall());
    document.getElementById('message-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('message-overlay')) this.closeMessageWall();
    });
    document.getElementById('message-roster').addEventListener('click', () => {
      if (!App.signaturePage) return;
      this.closeMessageWall();
      this.openPageDetail(App.signaturePage.page);
    });

    // 滚轮缩放
    const viewer = document.getElementById('image-viewer');
    viewer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      this.zoom(delta, e.clientX, e.clientY);
    }, { passive: false });

    // 双击缩放
    viewer.addEventListener('dblclick', (e) => {
      if (this.scale > 1) {
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;
      } else {
        this.zoom(1, e.clientX, e.clientY);
      }
      this.applyTransform();
    });

    // 拖动
    const img = document.getElementById('overlay-image');
    img.addEventListener('mousedown', (e) => {
      if (this.scale <= 1) return;
      this.isDragging = true;
      this.startX = e.clientX - this.translateX;
      this.startY = e.clientY - this.translateY;
      img.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.translateX = e.clientX - this.startX;
      this.translateY = e.clientY - this.startY;
      this.applyTransform();
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
      img.style.cursor = '';
    });

    // 触摸事件
    let touchStartDist = 0;
    let touchStartScale = 1;
    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeStartTime = 0;
    let isSwiping = false;

    viewer.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        touchStartDist = this.getTouchDist(e.touches);
        touchStartScale = this.scale;
        isSwiping = false;
      } else if (e.touches.length === 1 && this.scale > 1) {
        this.isDragging = true;
        this.startX = e.touches[0].clientX - this.translateX;
        this.startY = e.touches[0].clientY - this.translateY;
        isSwiping = false;
      } else if (e.touches.length === 1 && this.scale <= 1) {
        // 记录滑动起点用于翻页判断
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
        swipeStartTime = Date.now();
        isSwiping = true;
      }
    });

    viewer.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dist = this.getTouchDist(e.touches);
        this.scale = Math.max(1, Math.min(5, touchStartScale * (dist / touchStartDist)));
        this.applyTransform();
      } else if (e.touches.length === 1 && this.isDragging) {
        this.translateX = e.touches[0].clientX - this.startX;
        this.translateY = e.touches[0].clientY - this.startY;
        this.applyTransform();
      }
    }, { passive: false });

    viewer.addEventListener('touchend', (e) => {
      this.isDragging = false;

      // 检测滑动翻页（未缩放时）
      if (isSwiping) {
        const touch = e.changedTouches[0];
        const dx = touch.clientX - swipeStartX;
        const dy = touch.clientY - swipeStartY;
        const dt = Date.now() - swipeStartTime;

        // 水平滑动距离 > 60px，速度足够快，且垂直位移小于水平位移
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 500) {
          if (dx > 0) {
            this.prev();
          } else {
            this.next();
          }
        }
        isSwiping = false;
      }
    });

    // 提交评论
    document.getElementById('comment-submit').addEventListener('click', () => {
      this.submitComment();
    });

    document.getElementById('comment-text').addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        this.submitComment();
      }
    });

    // 颜色选择
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedColor = btn.dataset.color;
      });
    });
  },

  getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
};

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  Detail.init();
});
