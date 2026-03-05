/* YT Research Pro — pro-app.js */
'use strict';

/* ══════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════ */
var API = 'https://yt-research-api.nadavf.workers.dev/api';
var N8N_WEBHOOK = 'https://n8n.74111147.xyz/webhook/yt-extract';
var PROMPTS_API = API + '/prompts';
var POLLINATIONS_URL = 'https://image.pollinations.ai/prompt/';
var AUTH_TOKEN = '7bd2637b235db42353a7537918a07cbac0f3697a86df49455958414787d64363';

var BUILTIN_DEFAULT_PROMPT = "You are a senior research analyst. Extract the most valuable insights from this video transcript. Structure your response as:\n\n### Key Insights\n- Most important findings and claims\n\n### Practical Takeaways\n- Actionable advice and recommendations\n\n### Notable Quotes\n- Direct quotes that capture key ideas\n\n### Summary\nA concise 2-3 sentence summary of the video's main message.\n\nBe thorough but concise. Focus on unique insights, not obvious observations.";

var TOPIC_COLORS = {
  'openclaw': '#06b6d4', 'open claw': '#06b6d4',
  'tutorial': '#22c55e', 'review': '#f59e0b',
  'news': '#ef4444', 'demo': '#8b5cf6',
  'ai': '#a855f7', 'coding': '#10b981',
  'science': '#3b82f6', 'music': '#ec4899',
  'gaming': '#f97316', 'tech': '#14b8a6',
  'business': '#eab308', 'education': '#6366f1'
};

var STAR_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/></svg>';
var GEAR_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';

/* ══════════════════════════════════════════════════
   Global Helpers
   ══════════════════════════════════════════════════ */
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtNum(n) {
  if (n == null) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function fmtDuration(secs) {
  if (!secs) return '--:--';
  var h = Math.floor(secs / 3600);
  var m = Math.floor((secs % 3600) / 60);
  var s = secs % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch (e) { return iso; }
}

function relDate(iso) {
  if (!iso) return '';
  var diff = Date.now() - new Date(iso).getTime();
  var days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return days + 'd ago';
  if (days < 30) return Math.floor(days / 7) + 'w ago';
  return fmtDate(iso);
}

function $(id) { return document.getElementById(id); }

/* ══════════════════════════════════════════════════
   App Namespace
   ══════════════════════════════════════════════════ */
window.App = {};

/* ── App.state ── */
App.state = {
  allVideos: [],
  channels: {},
  topics: {},
  filterTopic: null,
  filterChannel: null,
  query: '',
  sortBy: 'date',
  currentView: 'cards',
  showArchived: false,
  selectMode: false,
  selectedIds: new Set(),
  transcriptCache: {},
  aiExtractCache: new Map()
};

/* ══════════════════════════════════════════════════
   App.storage
   ══════════════════════════════════════════════════ */
App.storage = {
  savePrefs: function() {
    try {
      localStorage.setItem('ytpro_prefs', JSON.stringify({
        sortBy: App.state.sortBy,
        currentView: App.state.currentView,
        showArchived: App.state.showArchived
      }));
    } catch (e) {}
  },
  loadPrefs: function() {
    try {
      var d = JSON.parse(localStorage.getItem('ytpro_prefs'));
      if (d) {
        if (d.sortBy) App.state.sortBy = d.sortBy;
        if (d.currentView) App.state.currentView = d.currentView;
        if (typeof d.showArchived === 'boolean') App.state.showArchived = d.showArchived;
      }
    } catch (e) {}
  },
  saveAICache: function() {
    try {
      var obj = {};
      App.state.aiExtractCache.forEach(function(v, k) { obj[k] = v; });
      localStorage.setItem('ytpro_ai_cache', JSON.stringify(obj));
    } catch (e) {}
  },
  loadAICache: function() {
    try {
      var d = JSON.parse(localStorage.getItem('ytpro_ai_cache'));
      if (d && typeof d === 'object') {
        Object.keys(d).forEach(function(k) { App.state.aiExtractCache.set(k, d[k]); });
      }
    } catch (e) {}
  },
  saveTranscriptCache: function() {
    try {
      localStorage.setItem('ytpro_transcript_cache', JSON.stringify(App.state.transcriptCache));
    } catch (e) {}
  },
  loadTranscriptCache: function() {
    try {
      var d = JSON.parse(localStorage.getItem('ytpro_transcript_cache'));
      if (d && typeof d === 'object') App.state.transcriptCache = d;
    } catch (e) {}
  }
};

/* ══════════════════════════════════════════════════
   App.toast
   ══════════════════════════════════════════════════ */
App.toast = {
  show: function(msg, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    var container = $('toast-container');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.style.setProperty('--duration', duration + 'ms');
    el.innerHTML = '<span class="toast-msg">' + esc(msg) + '</span><div class="toast-progress"></div>';
    container.appendChild(el);
    setTimeout(function() {
      el.classList.add('toast-exit');
      setTimeout(function() { el.remove(); }, 300);
    }, duration);
  }
};

/* Global alias for backward compat */
function showToast(msg, type) { App.toast.show(msg, type); }

/* ══════════════════════════════════════════════════
   App.confirm
   ══════════════════════════════════════════════════ */
App.confirm = {
  _onConfirm: null,
  show: function(opts) {
    var dialog = $('confirm-dialog');
    var icon = $('confirm-icon');
    var title = $('confirm-title');
    var msg = $('confirm-msg');
    var typeWrap = $('confirm-type-wrap');
    var typeInput = $('confirm-type-input');
    var okBtn = $('confirm-ok');
    var cancelBtn = $('confirm-cancel');
    if (!dialog) return;

    icon.innerHTML = opts.icon || '';
    title.textContent = opts.title || 'Confirm';
    msg.textContent = opts.message || '';
    okBtn.textContent = opts.confirmText || 'Confirm';
    okBtn.className = 'confirm-btn confirm-btn-ok' + (opts.type === 'danger' ? ' confirm-btn-danger' : opts.type === 'warning' ? ' confirm-btn-warning' : '');

    if (opts.requireType) {
      typeWrap.hidden = false;
      typeInput.value = '';
      typeInput.placeholder = 'Type "' + opts.requireType + '" to confirm';
      okBtn.disabled = true;
      typeInput.oninput = function() {
        okBtn.disabled = typeInput.value.trim() !== opts.requireType;
      };
    } else {
      typeWrap.hidden = true;
      okBtn.disabled = false;
    }

    App.confirm._onConfirm = opts.onConfirm || null;
    dialog.hidden = false;
    (opts.requireType ? typeInput : cancelBtn).focus();
  },
  _wire: function() {
    var dialog = $('confirm-dialog');
    var okBtn = $('confirm-ok');
    var cancelBtn = $('confirm-cancel');
    var backdrop = dialog ? dialog.querySelector('.confirm-backdrop') : null;
    if (!dialog) return;

    function close() {
      dialog.hidden = true;
      App.confirm._onConfirm = null;
    }
    cancelBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);
    okBtn.addEventListener('click', function() {
      var fn = App.confirm._onConfirm;
      close();
      if (fn) fn();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !dialog.hidden) close();
    });
  }
};

/* ══════════════════════════════════════════════════
   App.stats
   ══════════════════════════════════════════════════ */
App.stats = {
  render: function() {
    var st = App.state;
    var total = st.allVideos.filter(function(v) { return !v.archived; }).length;
    var archived = st.allVideos.filter(function(v) { return v.archived; }).length;
    var topicCount = Object.keys(st.topics).length;
    var channelCount = Object.keys(st.channels).length;

    App.stats._animateCounter('stat-total', total);
    App.stats._animateCounter('stat-topics', topicCount);
    App.stats._animateCounter('stat-channels', channelCount);
    App.stats._animateCounter('stat-archived', archived);

    $('count').textContent = st.allVideos.length;

    /* Fetch API health */
    fetch(API + '/groq-status')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        /* Groq dots */
        var groqDots = $('stat-groq-dots');
        if (groqDots && data.groq && data.groq.keys) {
          var html = '';
          data.groq.keys.forEach(function(k) {
            var cls = k.status === 'active' ? 'dot-ok' : 'dot-bad';
            html += '<span class="status-dot ' + cls + '" title="' + esc(k.label) + '"></span>';
          });
          groqDots.innerHTML = html;
        }
        /* Apify budget bar */
        var budgetBar = $('stat-budget-bar');
        if (budgetBar && data.apify && data.apify.accounts) {
          var totalRemaining = 0, totalLimit = 0;
          data.apify.accounts.forEach(function(a) {
            totalRemaining += (a.remainingUsd || 0);
            totalLimit += (a.limitUsd || 0);
          });
          var pct = totalLimit > 0 ? Math.round((totalRemaining / totalLimit) * 100) : 0;
          budgetBar.style.width = pct + '%';
          budgetBar.style.background = pct > 60 ? 'var(--green, #22c55e)' : pct > 25 ? 'var(--yellow, #eab308)' : 'var(--accent, #ef4444)';
        }
        /* Header dot */
        var dot = $('api-status-dot');
        if (dot && data.groq) {
          var groqOk = (data.groq.keys || []).every(function(k) { return k.status === 'active'; });
          var apifyOk = (data.apify && data.apify.accounts) ? data.apify.accounts.every(function(a) { return a.status === 'active'; }) : true;
          dot.className = 'status-dot ' + (groqOk && apifyOk ? 'dot-ok' : 'dot-warn');
        }
      })
      .catch(function() {});
  },
  _animateCounter: function(cellId, target) {
    var cell = $(cellId);
    if (!cell) return;
    var valEl = cell.querySelector('.stat-cell-val');
    if (!valEl) return;
    var current = parseInt(valEl.getAttribute('data-count')) || 0;
    if (current === target) { valEl.textContent = target; return; }
    valEl.setAttribute('data-count', target);
    var start = performance.now();
    var dur = 600;
    function step(now) {
      var t = Math.min((now - start) / dur, 1);
      t = 1 - Math.pow(1 - t, 3); /* ease-out cubic */
      valEl.textContent = Math.round(current + (target - current) * t);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
};

/* ══════════════════════════════════════════════════
   Filtering + Sorting (shared utility)
   ══════════════════════════════════════════════════ */
App.getFiltered = function() {
  var st = App.state;
  var list = st.allVideos.filter(function(v) {
    if (!st.showArchived && v.archived) return false;
    if (st.filterTopic && v.topic !== st.filterTopic) return false;
    if (st.filterChannel && v.channelId !== st.filterChannel) return false;
    if (st.query) {
      var q = st.query.toLowerCase();
      var t = (v.title || '').toLowerCase();
      var d = (v.description || '').toLowerCase();
      var ch = st.channels[v.channelId] ? st.channels[v.channelId].name.toLowerCase() : '';
      if (!t.includes(q) && !d.includes(q) && !ch.includes(q)) return false;
    }
    return true;
  });
  list.sort(function(a, b) {
    if (st.sortBy === 'views') return (b.viewCount || 0) - (a.viewCount || 0);
    if (st.sortBy === 'likes') return (b.likes || 0) - (a.likes || 0);
    if (st.sortBy === 'duration') return (b.durationSeconds || 0) - (a.durationSeconds || 0);
    if (st.sortBy === 'words') return (b.transcriptWordCount || 0) - (a.transcriptWordCount || 0);
    return new Date(b.date) - new Date(a.date);
  });
  return list;
};

/* ══════════════════════════════════════════════════
   App.cards
   ══════════════════════════════════════════════════ */
App.cards = {
  render: function() {
    var st = App.state;
    var list = App.getFiltered();
    var $cards = $('cards');
    var $empty = $('empty');
    var $info = $('result-info');

    $info.textContent = list.length === st.allVideos.length
      ? list.length + ' videos'
      : list.length + ' of ' + st.allVideos.length + ' videos';
    App.cards._updateFilters();

    if (!list.length) {
      $cards.innerHTML = '';
      $empty.hidden = false;
      return;
    }
    $empty.hidden = true;
    $cards.innerHTML = list.map(function(v, i) { return App.cards._html(v, i); }).join('');

    $cards.querySelectorAll('.card').forEach(function(el) {
      el.addEventListener('click', function(ev) {
        if (ev.target.closest('.card-transcript-toggle') || ev.target.closest('.card-transcript-container')) return;
        if (ev.target.closest('.card-action-btn')) return;
        if (st.selectMode) {
          App.selection.toggle(el.dataset.id);
          return;
        }
        App.drawer.open(el.dataset.id);
      });
      el.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); App.drawer.open(el.dataset.id); }
      });
    });

    $cards.querySelectorAll('.card-transcript-toggle').forEach(function(btn) {
      btn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        App.cards._toggleTranscript(btn.dataset.vid);
      });
    });

    /* Card action buttons */
    $cards.querySelectorAll('.card-archive-btn').forEach(function(btn) {
      btn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        App.archive.toggleArchive(btn.dataset.vid);
      });
    });
    $cards.querySelectorAll('.card-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        App.archive.deleteVideo(btn.dataset.vid);
      });
    });
  },

  _html: function(v, idx) {
    var st = App.state;
    var ch = st.channels[v.channelId];
    var chName = ch ? esc(ch.name) : '';
    var thumb = v.thumbnailUrl
      ? '<div class="card-thumb-wrap"><img class="card-thumb" src="' + esc(v.thumbnailUrl) + '" alt="" loading="lazy"><div class="card-thumb-gradient"></div><span class="card-duration">' + esc(fmtDuration(v.durationSeconds)) + '</span></div>'
      : '<div class="card-thumb-wrap"><div class="card-thumb-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none"><polygon points="10,8 10,16 16,12" fill="currentColor"/></svg></div></div>';

    var badges = '';
    if (v.hasTranscript) {
      badges += '<span class="card-badge badge-transcript">' + fmtNum(v.transcriptWordCount) + ' words</span>';
    } else {
      badges += '<span class="card-badge badge-no-transcript">No transcript</span>';
    }
    if (v.summary) badges += '<span class="card-badge badge-summary">Summarized</span>';
    if (v.archived) badges += '<span class="card-badge badge-archived">Archived</span>';

    var topicColor = TOPIC_COLORS[v.topic] || TOPIC_COLORS[(v.topic || '').toLowerCase()] || '#888';
    if (st.topics[v.topic] && st.topics[v.topic].color) topicColor = st.topics[v.topic].color;

    var selected = st.selectedIds.has(v.id) ? ' selected' : '';
    var archivedClass = v.archived ? ' card-archived' : '';
    var archiveIcon = v.archived
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>';

    return '<article class="card' + archivedClass + selected + '" data-id="' + esc(v.id) + '" tabindex="0" role="article" style="--i:' + idx + '">' +
      thumb +
      '<div class="card-body">' +
        '<h2 class="card-title">' + esc(v.title) + '</h2>' +
        (chName ? '<div class="card-channel">' + chName + '</div>' : '') +
        '<div class="card-meta">' +
          '<span>' + esc(relDate(v.date)) + '</span>' +
          '<span>' + esc(fmtDuration(v.durationSeconds)) + '</span>' +
          '<span>' + fmtNum(v.viewCount) + ' views</span>' +
        '</div>' +
        '<div class="card-badges">' +
          badges +
          '<span class="card-topic" style="background:' + topicColor + '22;color:' + topicColor + '">' + esc(v.topic || '') + '</span>' +
        '</div>' +
        '<div class="card-hover-actions">' +
          '<button class="card-action-btn card-archive-btn" data-vid="' + esc(v.id) + '" type="button" title="' + (v.archived ? 'Unarchive' : 'Archive') + '">' + archiveIcon + '</button>' +
          '<button class="card-action-btn card-delete-btn" data-vid="' + esc(v.id) + '" type="button" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>' +
        '</div>' +
        (v.hasTranscript
          ? '<button class="card-transcript-toggle" data-vid="' + esc(v.id) + '" type="button"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 6h16M4 12h16M4 18h10"/></svg> Transcript <span class="toggle-arrow">&#9660;</span></button>'
          : '') +
        '<div class="card-transcript-container" id="ct-' + esc(v.id) + '" hidden></div>' +
      '</div>' +
    '</article>';
  },

  _toggleTranscript: function(vid) {
    var container = $('ct-' + vid);
    if (!container) return;
    var btn = container.parentElement.querySelector('.card-transcript-toggle');

    if (!container.hidden) {
      container.hidden = true;
      if (btn) { btn.classList.remove('active'); btn.querySelector('.toggle-arrow').innerHTML = '&#9660;'; }
      return;
    }

    container.hidden = false;
    if (btn) { btn.classList.add('active'); btn.querySelector('.toggle-arrow').innerHTML = '&#9650;'; }

    if (App.state.transcriptCache[vid]) {
      App.cards._renderTranscript(vid, container);
      return;
    }

    container.innerHTML = '<div class="ct-loading"><span class="spinner"></span> Loading transcript...</div>';
    fetch(API + '/videos/' + encodeURIComponent(vid))
      .then(function(res) { return res.ok ? res.json() : null; })
      .then(function(data) {
        if (!data || !data.video || !data.video.transcript) {
          container.innerHTML = '<div class="ct-empty">Transcript not available.</div>';
          return;
        }
        App.state.transcriptCache[vid] = data.video.transcript;
        var idx = App.state.allVideos.findIndex(function(x) { return x.id === vid; });
        if (idx >= 0) {
          App.state.allVideos[idx].transcript = data.video.transcript;
          if (data.video.summary) App.state.allVideos[idx].summary = data.video.summary;
        }
        App.cards._renderTranscript(vid, container);
      })
      .catch(function() { container.innerHTML = '<div class="ct-empty">Failed to load transcript.</div>'; });
  },

  _renderTranscript: function(vid, container) {
    var text = App.state.transcriptCache[vid] || '';
    container.innerHTML =
      '<div class="ct-actions">' +
        '<button class="ct-copy-btn" type="button"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy</button>' +
        '<button class="ct-collapse-btn" type="button"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg> Collapse</button>' +
      '</div>' +
      '<div class="ct-text">' + esc(text) + '</div>';
    container.querySelector('.ct-copy-btn').addEventListener('click', function(ev) {
      ev.stopPropagation();
      navigator.clipboard.writeText(text).then(function() { showToast('Transcript copied!', 'success'); }).catch(function() {
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        showToast('Transcript copied!', 'success');
      });
    });
    container.querySelector('.ct-collapse-btn').addEventListener('click', function(ev) {
      ev.stopPropagation();
      App.cards._toggleTranscript(vid);
    });
  },

  _updateFilters: function() {
    var st = App.state;
    var $filters = $('filters');
    var parts = [];
    if (st.filterTopic) parts.push('<span class="filter-chip">' + esc(st.filterTopic) + ' <span class="filter-x" data-action="clear-topic">&times;</span></span>');
    if (st.filterChannel) {
      var ch = st.channels[st.filterChannel];
      var name = ch ? ch.name : st.filterChannel;
      parts.push('<span class="filter-chip">' + esc(name) + ' <span class="filter-x" data-action="clear-channel">&times;</span></span>');
    }
    if (st.query) parts.push('<span class="filter-chip">&ldquo;' + esc(st.query) + '&rdquo; <span class="filter-x" data-action="clear-search">&times;</span></span>');
    if (!parts.length) { $filters.hidden = true; return; }
    $filters.hidden = false;
    $filters.innerHTML = '<span>Filtering:</span> ' + parts.join(' ');
    $filters.querySelectorAll('.filter-x').forEach(function(x) {
      x.addEventListener('click', function() {
        var a = x.dataset.action;
        if (a === 'clear-topic') st.filterTopic = null;
        else if (a === 'clear-channel') st.filterChannel = null;
        else if (a === 'clear-search') { st.query = ''; $('search').value = ''; }
        App.cards.render(); App.sidebar.buildTopics(); App.sidebar.buildChannels();
      });
    });
  }
};

/* ══════════════════════════════════════════════════
   App.drawer
   ══════════════════════════════════════════════════ */
App.drawer = {
  open: function(id) {
    var st = App.state;
    var v = st.allVideos.find(function(x) { return x.id === id; });
    if (!v) return;

    App.drawer._render(v, st.channels[v.channelId] || null, true);
    $('drawer').hidden = false;
    document.body.classList.add('drawer-open');
    $('drawer-panel').scrollTop = 0;
    var scrollTop = $('drawer-scroll-top');
    if (scrollTop) scrollTop.classList.remove('visible');
    if (location.hash !== '#video/' + id) history.pushState(null, '', '#video/' + id);
    $('drawer-close').focus();

    fetch(API + '/videos/' + encodeURIComponent(id))
      .then(function(res) { return res.ok ? res.json() : null; })
      .then(function(data) {
        if (!data || !data.video) return;
        var idx = st.allVideos.findIndex(function(x) { return x.id === id; });
        if (idx >= 0) {
          st.allVideos[idx] = Object.assign({}, st.allVideos[idx], { transcript: data.video.transcript, summary: data.video.summary, summaryModel: data.video.summaryModel });
        }
        if (!$('drawer').hidden) {
          App.drawer._render(data.video, data.channel, false);
        }
      });
  },

  close: function() {
    $('drawer').hidden = true;
    document.body.classList.remove('drawer-open');
    if (location.hash.startsWith('#video/')) history.pushState(null, '', location.pathname);
  },

  _render: function(v, ch, loading) {
    var st = App.state;
    var chName = ch ? ch.name : '';
    var chUrl = ch ? ch.url : '';
    var isArchived = v.archived;

    $('drawer-head').innerHTML =
      '<h1 class="drawer-title" id="drawer-title">' + esc(v.title) + '</h1>' +
      '<div class="drawer-meta">' +
        (chName ? '<a href="' + esc(chUrl || '#') + '" target="_blank" rel="noopener" class="drawer-channel">' + esc(chName) + '</a>' : '') +
        '<span>' + esc(fmtDate(v.date)) + '</span>' +
        '<span>' + esc(fmtDuration(v.durationSeconds)) + '</span>' +
      '</div>';

    var thumbHtml = v.thumbnailUrl
      ? '<a href="' + esc(v.url) + '" target="_blank" rel="noopener"><img class="drawer-thumb" src="' + esc(v.thumbnailUrl) + '" alt="Watch on YouTube"></a>'
      : '';

    var actions =
      '<div class="drawer-actions">' +
        '<a href="' + esc(v.url) + '" target="_blank" rel="noopener" class="drawer-btn primary"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="10,8 10,16 16,12"/></svg> Watch on YouTube</a>' +
        '<button class="drawer-btn" id="btn-copy" ' + (!v.transcript && loading ? 'disabled' : '') + '><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy Transcript</button>' +
        '<button class="drawer-btn" id="btn-download" ' + (!v.hasTranscript ? 'disabled' : '') + '><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download .txt</button>' +
        '<button class="drawer-btn" id="btn-summarize" ' + (!v.hasTranscript ? 'disabled' : '') + '><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> ' + (v.summary ? 'Re-summarize' : 'Summarize with AI') + '</button>' +
        '<button class="drawer-btn" id="btn-archive">' + (isArchived ? 'Unarchive' : 'Archive') + '</button>' +
        '<button class="drawer-btn drawer-btn-danger" id="btn-delete">Delete</button>' +
      '</div>';

    var stats =
      '<div class="drawer-stats">' +
        '<div class="stat-card"><div class="stat-val">' + fmtNum(v.viewCount) + '</div><div class="stat-label">Views</div></div>' +
        '<div class="stat-card"><div class="stat-val">' + fmtNum(v.likes) + '</div><div class="stat-label">Likes</div></div>' +
        '<div class="stat-card"><div class="stat-val">' + fmtNum(v.commentsCount) + '</div><div class="stat-label">Comments</div></div>' +
        '<div class="stat-card"><div class="stat-val">' + fmtNum(v.transcriptWordCount) + '</div><div class="stat-label">Words</div></div>' +
        '<div class="stat-card"><div class="stat-val">' + esc(fmtDuration(v.durationSeconds)) + '</div><div class="stat-label">Duration</div></div>' +
      '</div>';

    var transcriptHtml = '';
    if (loading && !v.transcript) {
      transcriptHtml = '<div class="transcript-section"><div class="transcript-header">Transcript</div><div class="transcript-text" style="text-align:center;padding:40px"><span class="spinner"></span> Loading transcript...</div></div>';
    } else if (v.transcript) {
      transcriptHtml = '<div class="transcript-section"><div class="transcript-header">Transcript</div><div class="transcript-text" id="transcript-text">' + esc(v.transcript) + '</div></div>';
    } else if (v.hasTranscript === false) {
      transcriptHtml = '<div class="transcript-section"><div class="transcript-header">Transcript</div><div class="transcript-text" style="text-align:center;color:var(--text-dim);padding:30px">No transcript available for this video.</div></div>';
    }

    var summaryHtml = '';
    if (v.summary) {
      summaryHtml = '<div class="summary-section"><div class="transcript-header">AI Summary</div><div class="summary-text">' + esc(v.summary).replace(/\n/g, '<br>') + '</div>' +
        (v.summaryModel ? '<div class="summary-model">Generated by ' + esc(v.summaryModel) + '</div>' : '') + '</div>';
    }
    summaryHtml += '<div id="summary-slot"></div>';

    $('drawer-body').innerHTML = thumbHtml + actions + stats + transcriptHtml + summaryHtml;
    App.drawer._wireActions(v);
  },

  _wireActions: function(v) {
    var st = App.state;
    var btnCopy = $('drawer-body').querySelector('#btn-copy');
    var btnDl = $('drawer-body').querySelector('#btn-download');
    var btnSum = $('drawer-body').querySelector('#btn-summarize');
    var btnArchive = $('drawer-body').querySelector('#btn-archive');
    var btnDelete = $('drawer-body').querySelector('#btn-delete');

    if (btnCopy) {
      btnCopy.addEventListener('click', function() {
        var text = v.transcript || '';
        if (!text) { showToast('No transcript to copy', 'warning'); return; }
        navigator.clipboard.writeText(text).then(function() { showToast('Transcript copied!', 'success'); }).catch(function() {
          var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
          showToast('Transcript copied!', 'success');
        });
      });
    }

    if (btnDl) {
      btnDl.addEventListener('click', function() {
        window.open(API + '/export?videoId=' + encodeURIComponent(v.id), '_blank');
      });
    }

    if (btnSum) {
      btnSum.addEventListener('click', function() {
        btnSum.disabled = true;
        btnSum.innerHTML = '<span class="spinner"></span> Summarizing...';
        fetch(API + '/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: v.id }) })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.error) throw new Error(data.error);
            var idx = st.allVideos.findIndex(function(x) { return x.id === v.id; });
            if (idx >= 0) { st.allVideos[idx].summary = data.summary; st.allVideos[idx].summaryModel = data.model; }
            v.summary = data.summary; v.summaryModel = data.model;
            var slot = $('summary-slot');
            if (slot) {
              slot.innerHTML = '<div class="summary-section"><div class="transcript-header">AI Summary' + (data.cached ? ' (cached)' : '') + '</div><div class="summary-text">' + esc(data.summary).replace(/\n/g, '<br>') + '</div>' +
                (data.model ? '<div class="summary-model">Generated by ' + esc(data.model) + '</div>' : '') + '</div>';
            }
            btnSum.disabled = false;
            btnSum.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Re-summarize';
            App.cards.render();
          })
          .catch(function(err) {
            btnSum.disabled = false;
            btnSum.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Summarize with AI';
            showToast('Failed: ' + (err.message || 'Unknown error'), 'error');
          });
      });
    }

    if (btnArchive) {
      btnArchive.addEventListener('click', function() {
        App.archive.toggleArchive(v.id);
        App.drawer.close();
      });
    }

    if (btnDelete) {
      btnDelete.addEventListener('click', function() {
        App.archive.deleteVideo(v.id);
      });
    }
  }
};

/* ══════════════════════════════════════════════════
   App.sidebar
   ══════════════════════════════════════════════════ */
App.sidebar = {
  buildTopics: function() {
    var st = App.state;
    var tc = {};
    st.allVideos.forEach(function(v) {
      if (!st.showArchived && v.archived) return;
      if (v.topic) tc[v.topic] = (tc[v.topic] || 0) + 1;
    });

    Object.keys(tc).forEach(function(t) {
      st.topics[t] = { label: t, color: TOPIC_COLORS[t] || TOPIC_COLORS[t.toLowerCase()] || '#888', count: tc[t] };
    });

    var totalCount = st.allVideos.filter(function(v) { return st.showArchived || !v.archived; }).length;
    var html = '<button class="cat-btn' + (!st.filterTopic ? ' active' : '') + '" data-topic="">' +
      '<span>All</span><span class="cat-count">' + totalCount + '</span></button>';

    Object.keys(tc).forEach(function(t) {
      var active = st.filterTopic === t;
      var color = st.topics[t].color;
      html += '<button class="cat-btn' + (active ? ' active' : '') + '" data-topic="' + esc(t) + '">' +
        '<span><span class="cat-dot" style="background:' + color + '"></span>' + esc(t) + '</span>' +
        '<span class="cat-count">' + tc[t] + '</span></button>';
    });

    var $topics = $('topics');
    $topics.innerHTML = html;
    $topics.querySelectorAll('.cat-btn').forEach(function(b) {
      b.addEventListener('click', function() {
        st.filterTopic = b.dataset.topic || null;
        st.filterChannel = null;
        App.cards.render(); App.sidebar.buildTopics(); App.sidebar.buildChannels();
      });
      /* Right-click context menu */
      b.addEventListener('contextmenu', function(e) {
        if (!b.dataset.topic) return;
        e.preventDefault();
        App.sidebar._showTopicContext(e, b.dataset.topic);
      });
    });
  },

  buildChannels: function() {
    var st = App.state;
    var cc = {};
    st.allVideos.forEach(function(v) {
      if (!st.showArchived && v.archived) return;
      if (v.channelId) cc[v.channelId] = (cc[v.channelId] || 0) + 1;
    });

    var sorted = Object.entries(cc).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 12);
    var $channels = $('channels');
    if (!sorted.length) { $channels.innerHTML = ''; return; }

    var html = '';
    sorted.forEach(function(pair) {
      var cid = pair[0], cnt = pair[1];
      var ch = st.channels[cid];
      var name = ch ? ch.name : cid;
      var active = st.filterChannel === cid;
      html += '<button class="channel-btn' + (active ? ' active' : '') + '" data-channel="' + esc(cid) + '">' +
        '<span>' + esc(name) + '</span><span class="cat-count">' + cnt + '</span></button>';
    });

    $channels.innerHTML = html;
    $channels.querySelectorAll('.channel-btn').forEach(function(b) {
      b.addEventListener('click', function() {
        st.filterChannel = st.filterChannel === b.dataset.channel ? null : b.dataset.channel;
        st.filterTopic = null;
        App.cards.render(); App.sidebar.buildTopics(); App.sidebar.buildChannels();
      });
    });
  },

  _showTopicContext: function(e, topic) {
    var old = document.querySelector('.topic-context-menu');
    if (old) old.remove();
    var menu = document.createElement('div');
    menu.className = 'topic-context-menu';
    menu.innerHTML =
      '<button class="ctx-item" data-action="archive-topic">Archive Topic</button>' +
      '<button class="ctx-item ctx-item-danger" data-action="delete-topic">Delete Topic</button>';
    menu.style.top = e.clientY + 'px';
    menu.style.left = e.clientX + 'px';
    document.body.appendChild(menu);

    menu.querySelector('[data-action="archive-topic"]').addEventListener('click', function() {
      menu.remove();
      var ids = App.state.allVideos.filter(function(v) { return v.topic === topic && !v.archived; }).map(function(v) { return v.id; });
      if (ids.length) App.archive.batchArchive(ids, true);
    });
    menu.querySelector('[data-action="delete-topic"]').addEventListener('click', function() {
      menu.remove();
      var ids = App.state.allVideos.filter(function(v) { return v.topic === topic; }).map(function(v) { return v.id; });
      if (ids.length) App.archive.batchDelete(ids);
    });

    function closeCtx(ev) { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', closeCtx, true); } }
    setTimeout(function() { document.addEventListener('mousedown', closeCtx, true); }, 10);
  }
};

/* ══════════════════════════════════════════════════
   App.search
   ══════════════════════════════════════════════════ */
App.search = {
  _timer: null,
  wire: function() {
    var input = $('search');
    if (!input) return;
    input.addEventListener('input', function() {
      clearTimeout(App.search._timer);
      App.search._timer = setTimeout(function() {
        App.state.query = input.value.trim();
        App.state.filterTopic = null;
        App.state.filterChannel = null;
        App.cards.render(); App.sidebar.buildTopics(); App.sidebar.buildChannels();
      }, 200);
    });
  }
};

/* ══════════════════════════════════════════════════
   App.scrape
   ══════════════════════════════════════════════════ */
App.scrape = {
  wire: function() {
    var btn = $('scrape-btn');
    var input = $('scrape-topic');
    if (!btn || !input) return;
    btn.addEventListener('click', function() { App.scrape.start(); });
    input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') App.scrape.start(); });
  },

  start: function() {
    var input = $('scrape-topic');
    var btn = $('scrape-btn');
    var status = $('scrape-status');
    var topic = input.value.trim();
    if (!topic) { input.focus(); return; }

    btn.disabled = true;
    status.hidden = false;
    status.className = 'scrape-status loading';
    status.innerHTML = '<span class="spinner"></span> Scraping YouTube for "' + esc(topic) + '"... This takes 2-4 minutes.';

    fetch(API + '/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: topic }) })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error);
        status.className = 'scrape-status success';
        status.innerHTML = 'Scrape started for "' + esc(topic) + '". New videos will appear in a few minutes. <button class="scrape-refresh-btn" type="button">Refresh now</button>';
        btn.disabled = false;
        var refreshTimer = setTimeout(function() { App.scrape.refresh(); }, 180000);
        var refreshBtn = status.querySelector('.scrape-refresh-btn');
        if (refreshBtn) refreshBtn.addEventListener('click', function() { clearTimeout(refreshTimer); App.scrape.refresh(); });
      })
      .catch(function(err) {
        status.className = 'scrape-status error';
        status.textContent = 'Failed: ' + (err.message || 'Unknown error');
        btn.disabled = false;
      });
  },

  refresh: function() {
    var status = $('scrape-status');
    status.className = 'scrape-status loading';
    status.innerHTML = '<span class="spinner"></span> Refreshing...';

    fetch(API + '/videos')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var st = App.state;
        var oldCount = st.allVideos.length;
        st.allVideos = data.videos || [];
        st.channels = data.channels || {};
        var newCount = st.allVideos.length;
        var diff = newCount - oldCount;

        App.sidebar.buildTopics(); App.sidebar.buildChannels();
        App.cards.render(); App.stats.render();

        if (diff > 0) {
          status.className = 'scrape-status success';
          status.textContent = diff + ' new video' + (diff > 1 ? 's' : '') + ' added! Total: ' + newCount;
          showToast(diff + ' new videos added!', 'success');
        } else {
          status.className = 'scrape-status loading';
          status.innerHTML = 'No new videos yet. Scrape may still be running. <button class="scrape-refresh-btn" type="button">Try again</button>';
          var btn = status.querySelector('.scrape-refresh-btn');
          if (btn) btn.addEventListener('click', function() { App.scrape.refresh(); });
        }
      })
      .catch(function() {
        status.className = 'scrape-status error';
        status.textContent = 'Failed to refresh data';
      });
  }
};

/* ══════════════════════════════════════════════════
   App.archive
   ══════════════════════════════════════════════════ */
App.archive = {
  toggleArchive: function(videoId) {
    var st = App.state;
    var v = st.allVideos.find(function(x) { return x.id === videoId; });
    if (!v) return;
    var newState = !v.archived;

    fetch(API + '/videos/' + encodeURIComponent(videoId) + '/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN },
      body: JSON.stringify({ archived: newState })
    })
    .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function() {
      v.archived = newState;
      App.cards.render(); App.stats.render(); App.sidebar.buildTopics(); App.sidebar.buildChannels();
      showToast(newState ? 'Video archived' : 'Video unarchived', 'success');
    })
    .catch(function(err) { showToast('Failed: ' + err.message, 'error'); });
  },

  deleteVideo: function(videoId) {
    App.confirm.show({
      title: 'Delete Video',
      message: 'This will permanently delete this video and its transcript.',
      icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: function() {
        fetch(API + '/videos/' + encodeURIComponent(videoId), {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + AUTH_TOKEN }
        })
        .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
        .then(function() {
          App.state.allVideos = App.state.allVideos.filter(function(v) { return v.id !== videoId; });
          App.drawer.close();
          App.cards.render(); App.stats.render(); App.sidebar.buildTopics(); App.sidebar.buildChannels();
          showToast('Video deleted', 'success');
        })
        .catch(function(err) { showToast('Delete failed: ' + err.message, 'error'); });
      }
    });
  },

  batchArchive: function(ids, archived) {
    fetch(API + '/videos/batch-archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN },
      body: JSON.stringify({ videoIds: ids, archived: archived })
    })
    .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function() {
      ids.forEach(function(id) {
        var v = App.state.allVideos.find(function(x) { return x.id === id; });
        if (v) v.archived = archived;
      });
      App.cards.render(); App.stats.render(); App.sidebar.buildTopics(); App.sidebar.buildChannels();
      showToast((archived ? 'Archived ' : 'Unarchived ') + ids.length + ' video(s)', 'success');
    })
    .catch(function(err) { showToast('Batch archive failed: ' + err.message, 'error'); });
  },

  batchDelete: function(ids) {
    App.confirm.show({
      title: 'Delete ' + ids.length + ' Videos',
      message: 'This will permanently delete ' + ids.length + ' video(s) and their transcripts. This cannot be undone.',
      icon: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
      type: 'danger',
      confirmText: 'Delete All',
      requireType: 'DELETE ' + ids.length,
      onConfirm: function() {
        fetch(API + '/videos/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AUTH_TOKEN },
          body: JSON.stringify({ videoIds: ids })
        })
        .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
        .then(function() {
          App.state.allVideos = App.state.allVideos.filter(function(v) { return ids.indexOf(v.id) === -1; });
          App.state.selectedIds.clear();
          App.cards.render(); App.stats.render(); App.sidebar.buildTopics(); App.sidebar.buildChannels();
          App.selection._updateBar();
          showToast('Deleted ' + ids.length + ' video(s)', 'success');
        })
        .catch(function(err) { showToast('Batch delete failed: ' + err.message, 'error'); });
      }
    });
  }
};

/* ══════════════════════════════════════════════════
   App.selection
   ══════════════════════════════════════════════════ */
App.selection = {
  _bar: null,

  toggleSelectMode: function() {
    var st = App.state;
    st.selectMode = !st.selectMode;
    var btn = $('select-mode-btn');
    if (btn) btn.classList.toggle('active', st.selectMode);
    var cards = $('cards');
    if (cards) cards.classList.toggle('selectable', st.selectMode);
    if (!st.selectMode) {
      st.selectedIds.clear();
      document.querySelectorAll('.card.selected').forEach(function(el) { el.classList.remove('selected'); });
    }
    App.selection._updateBar();
  },

  toggle: function(videoId) {
    var st = App.state;
    if (st.selectedIds.has(videoId)) {
      st.selectedIds.delete(videoId);
    } else {
      st.selectedIds.add(videoId);
    }
    var card = document.querySelector('.card[data-id="' + videoId + '"]');
    if (card) card.classList.toggle('selected', st.selectedIds.has(videoId));
    App.selection._updateBar();
  },

  selectAll: function() {
    var list = App.getFiltered();
    list.forEach(function(v) { App.state.selectedIds.add(v.id); });
    document.querySelectorAll('.card').forEach(function(el) { el.classList.add('selected'); });
    App.selection._updateBar();
  },

  clearSelection: function() {
    App.state.selectedIds.clear();
    document.querySelectorAll('.card.selected').forEach(function(el) { el.classList.remove('selected'); });
    App.selection._updateBar();
  },

  _ensureBar: function() {
    if (App.selection._bar) return;
    var bar = document.createElement('div');
    bar.id = 'floating-action-bar';
    bar.className = 'floating-action-bar';
    bar.innerHTML =
      '<span class="fab-count"></span>' +
      '<button class="fab-btn" id="fab-select-all" type="button">Select All</button>' +
      '<button class="fab-btn fab-btn-primary" id="fab-copy-all" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy All</button>' +
      '<button class="fab-btn fab-btn-purple" id="fab-extract" type="button">' + STAR_ICON + ' Extract Best</button>' +
      '<button class="fab-btn fab-btn-hebrew" id="fab-translate" type="button">Translate</button>' +
      '<button class="fab-btn fab-btn-archive" id="fab-archive" type="button">Archive Selected</button>' +
      '<button class="fab-btn fab-btn-danger" id="fab-delete" type="button">Delete Selected</button>' +
      '<button class="fab-btn fab-btn-dim" id="fab-clear" type="button">Clear</button>';
    document.body.appendChild(bar);
    App.selection._bar = bar;

    bar.querySelector('#fab-select-all').addEventListener('click', function() {
      var st = App.state;
      var allSelected = App.getFiltered().length === st.selectedIds.size;
      if (allSelected) App.selection.clearSelection();
      else App.selection.selectAll();
    });
    bar.querySelector('#fab-copy-all').addEventListener('click', function() { App.selection._copyAll(); });
    bar.querySelector('#fab-extract').addEventListener('click', function() {
      var ids = Array.from(App.state.selectedIds);
      if (!ids.length) { showToast('No videos selected', 'warning'); return; }
      App.extract.batchExtract(ids);
    });
    bar.querySelector('#fab-translate').addEventListener('click', function() {
      var ids = Array.from(App.state.selectedIds);
      if (!ids.length) { showToast('No videos selected', 'warning'); return; }
      App.translate.batchTranslateSelected(ids);
    });
    bar.querySelector('#fab-archive').addEventListener('click', function() {
      var ids = Array.from(App.state.selectedIds);
      if (!ids.length) return;
      App.archive.batchArchive(ids, true);
      App.selection.clearSelection();
    });
    bar.querySelector('#fab-delete').addEventListener('click', function() {
      var ids = Array.from(App.state.selectedIds);
      if (!ids.length) return;
      App.archive.batchDelete(ids);
    });
    bar.querySelector('#fab-clear').addEventListener('click', function() { App.selection.clearSelection(); });
  },

  _updateBar: function() {
    App.selection._ensureBar();
    var bar = App.selection._bar;
    var count = App.state.selectedIds.size;
    if (count === 0) {
      bar.classList.remove('visible');
      return;
    }
    bar.classList.add('visible');
    bar.querySelector('.fab-count').textContent = count + ' selected';
    var allCount = App.getFiltered().length;
    bar.querySelector('#fab-select-all').textContent = count >= allCount ? 'Deselect All' : 'Select All';
  },

  _copyAll: function() {
    var st = App.state;
    if (st.selectedIds.size === 0) return;
    var parts = [];
    st.selectedIds.forEach(function(vid) {
      var v = st.allVideos.find(function(x) { return x.id === vid; });
      if (!v) return;
      var text = v.transcript || st.transcriptCache[vid] || '';
      if (text) parts.push('--- ' + (v.title || 'Unknown') + ' ---\n\n' + text);
    });
    var combined = parts.join('\n\n');
    if (!combined) { showToast('No transcript text found', 'warning'); return; }
    navigator.clipboard.writeText(combined).then(function() {
      showToast(st.selectedIds.size + ' transcript(s) copied!', 'success');
    }).catch(function() {
      var ta = document.createElement('textarea'); ta.value = combined; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      showToast(st.selectedIds.size + ' transcript(s) copied!', 'success');
    });
  }
};

/* ══════════════════════════════════════════════════
   App.reader
   ══════════════════════════════════════════════════ */
App.reader = {
  _loaded: false,
  _transcripts: {},
  _searchTerm: '',
  _results: [],

  showReaderView: function() {
    var $cards = $('cards');
    var $empty = $('empty');
    var $sortBar = $('sort-bar');
    var $filters = $('filters');
    var $readerView = $('reader-view');
    if ($cards) $cards.style.display = 'none';
    if ($empty) $empty.hidden = true;
    if ($sortBar) $sortBar.style.display = 'none';
    if ($filters) $filters.hidden = true;
    if ($readerView) $readerView.hidden = false;

    if (!App.reader._loaded) {
      App.reader.loadAllTranscripts();
    }
  },

  showCardsView: function() {
    var $cards = $('cards');
    var $sortBar = $('sort-bar');
    var $readerView = $('reader-view');
    if ($cards) $cards.style.display = '';
    if ($sortBar) $sortBar.style.display = '';
    if ($readerView) $readerView.hidden = true;
  },

  loadAllTranscripts: function() {
    var st = App.state;
    var $readerContent = $('reader-content');
    var $readerProgress = $('reader-progress');
    var $readerProgressBar = $('reader-progress-bar');
    var $readerProgressText = $('reader-progress-text');
    var $readerSearchBar = $('reader-search-bar');

    if (!st.allVideos.length) {
      if ($readerContent) $readerContent.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:40px">No videos loaded yet.</p>';
      return;
    }

    var videosWithTranscript = st.allVideos.filter(function(v) { return v.hasTranscript; });
    var total = videosWithTranscript.length;

    if (total === 0) {
      if ($readerContent) $readerContent.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:40px">No videos with transcripts found.</p>';
      App.reader._loaded = true;
      return;
    }

    $readerProgress.hidden = false;
    $readerSearchBar.hidden = true;
    $readerProgressText.textContent = 'Loading 0/' + total + ' transcripts...';
    $readerProgressBar.style.setProperty('--progress', '0%');

    var loaded = 0;
    var results = [];
    var concurrency = 5;
    var queue = videosWithTranscript.slice();
    var active = 0;

    function processNext() {
      if (queue.length === 0 && active === 0) {
        onAllLoaded(results);
        return;
      }
      while (active < concurrency && queue.length > 0) {
        active++;
        fetchOne(queue.shift());
      }
    }

    function fetchOne(v) {
      fetch(API + '/videos/' + encodeURIComponent(v.id))
        .then(function(res) { return res.ok ? res.json() : null; })
        .then(function(data) {
          if (data && data.video) {
            var entry = {
              video: Object.assign({}, v, { transcript: data.video.transcript, summary: data.video.summary }),
              channel: data.channel
            };
            results.push(entry);
            App.reader._transcripts[v.id] = entry;
          }
        })
        .catch(function() {})
        .finally(function() {
          loaded++;
          active--;
          var pct = Math.round((loaded / total) * 100);
          $readerProgressBar.style.setProperty('--progress', pct + '%');
          $readerProgressText.textContent = 'Loading ' + loaded + '/' + total + ' transcripts...';
          processNext();
        });
    }

    processNext();

    function onAllLoaded(res) {
      App.reader._loaded = true;
      App.reader._results = res;
      $readerProgress.hidden = true;
      $readerSearchBar.hidden = false;

      res.sort(function(a, b) { return new Date(b.video.date) - new Date(a.video.date); });

      App.reader.renderReaderToc(res);
      App.reader.renderReaderContent(res);
      App.reader._setupScrollSpy(res);
      App.reader._wireSearch(res);
    }
  },

  renderReaderToc: function(results) {
    var $readerToc = $('reader-toc');
    var html = '';
    results.forEach(function(r, i) {
      var v = r.video;
      var ch = r.channel;
      var chName = ch ? ch.name : '';
      html += '<button class="reader-toc-item' + (i === 0 ? ' active' : '') + '" data-index="' + i + '" data-id="' + esc(v.id) + '" title="' + esc(v.title) + '">' +
        esc(v.title) +
        (chName ? '<span class="reader-toc-channel">' + esc(chName) + '</span>' : '') +
        '</button>';
    });
    $readerToc.innerHTML = html;

    $readerToc.querySelectorAll('.reader-toc-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id;
        var section = $('reader-section-' + id);
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $readerToc.querySelectorAll('.reader-toc-item').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  },

  renderReaderContent: function(results) {
    var $readerContent = $('reader-content');
    var html = '';
    results.forEach(function(r) {
      var v = r.video;
      var ch = r.channel;
      var chName = ch ? esc(ch.name) : '';
      var transcript = v.transcript || '';

      html += '<div class="reader-section" id="reader-section-' + esc(v.id) + '">' +
        '<div class="reader-section-header">' +
          '<h2 class="reader-section-title"><a href="' + esc(v.url) + '" target="_blank" rel="noopener">' + esc(v.title) + '</a></h2>' +
          '<div class="reader-section-meta">' +
            (chName ? '<span class="reader-section-channel">' + chName + '</span>' : '') +
            '<span>' + fmtDate(v.date) + '</span>' +
            '<span>' + fmtDuration(v.durationSeconds) + '</span>' +
            '<span>' + fmtNum(v.viewCount) + ' views</span>' +
            (v.transcriptWordCount ? '<span>' + fmtNum(v.transcriptWordCount) + ' words</span>' : '') +
          '</div>' +
        '</div>';

      if (transcript) {
        html += '<div class="reader-section-transcript" data-video-id="' + esc(v.id) + '">' + esc(transcript) + '</div>';
      } else {
        html += '<div class="reader-section-no-transcript">Transcript not available</div>';
      }
      html += '</div>';
    });
    $readerContent.innerHTML = html;

    /* Inject controls: checkboxes, copy, extract buttons */
    App.reader._injectControls();
    App.extract.injectExtractButtons();
  },

  _injectControls: function() {
    var sections = document.querySelectorAll('.reader-section');
    sections.forEach(function(section) {
      var header = section.querySelector('.reader-section-header');
      if (!header || header.querySelector('.reader-section-checkbox')) return;
      var sectionId = section.id.replace('reader-section-', '');

      /* Checkbox */
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'reader-section-checkbox';
      cb.dataset.videoId = sectionId;
      cb.title = 'Select for batch actions';
      cb.addEventListener('change', function() {
        if (cb.checked) App.state.selectedIds.add(sectionId);
        else App.state.selectedIds.delete(sectionId);
        App.selection._updateBar();
      });
      header.insertBefore(cb, header.firstChild);

      /* Copy button */
      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'reader-copy-btn';
      copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy';
      copyBtn.addEventListener('click', function() {
        var transcriptEl = section.querySelector('.reader-section-transcript');
        var text = transcriptEl ? transcriptEl.textContent : '';
        if (!text) { showToast('No transcript to copy', 'warning'); return; }
        navigator.clipboard.writeText(text).then(function() {
          showToast('Transcript copied!', 'success');
          copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied';
          setTimeout(function() {
            copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy';
          }, 1500);
        }).catch(function() {
          var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
          showToast('Transcript copied!', 'success');
        });
      });
      header.appendChild(copyBtn);
    });
  },

  _setupScrollSpy: function(results) {
    var $readerToc = $('reader-toc');
    var sections = results.map(function(r) { return $('reader-section-' + r.video.id); }).filter(Boolean);
    var tocButtons = $readerToc.querySelectorAll('.reader-toc-item');
    var headerOffset = 80;
    var lastActive = -1;

    function onScroll() {
      var current = 0;
      for (var i = 0; i < sections.length; i++) {
        var rect = sections[i].getBoundingClientRect();
        if (rect.top <= headerOffset + 20) current = i;
      }
      tocButtons.forEach(function(b, idx) { b.classList.toggle('active', idx === current); });
      if (current !== lastActive && tocButtons[current]) {
        lastActive = current;
        tocButtons[current].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  },

  _wireSearch: function(results) {
    var $readerSearch = $('reader-search');
    var timer;
    $readerSearch.addEventListener('input', function() {
      clearTimeout(timer);
      timer = setTimeout(function() {
        App.reader._searchTerm = $readerSearch.value.trim();
        App.reader._applySearch(results);
      }, 250);
    });
  },

  _applySearch: function(results) {
    var $readerContent = $('reader-content');
    var $readerSearchCount = $('reader-search-count');
    var transcriptEls = $readerContent.querySelectorAll('.reader-section-transcript');

    if (!App.reader._searchTerm) {
      transcriptEls.forEach(function(el) {
        var vid = el.dataset.videoId;
        var r = App.reader._transcripts[vid];
        if (r && r.video.transcript) el.innerHTML = esc(r.video.transcript);
      });
      $readerSearchCount.textContent = '';
      return;
    }

    var totalMatches = 0;
    var escapedSearch = App.reader._searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('(' + escapedSearch + ')', 'gi');

    transcriptEls.forEach(function(el) {
      var vid = el.dataset.videoId;
      var r = App.reader._transcripts[vid];
      if (!r || !r.video.transcript) return;
      var text = r.video.transcript;
      var matches = text.match(regex);
      if (matches) {
        totalMatches += matches.length;
        el.innerHTML = esc(text).replace(
          new RegExp('(' + escapedSearch.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + ')', 'gi'),
          '<mark class="reader-highlight">$1</mark>'
        );
      } else {
        el.innerHTML = esc(text);
      }
    });

    $readerSearchCount.textContent = totalMatches + ' match' + (totalMatches !== 1 ? 'es' : '') + ' found';
    if (totalMatches > 0) {
      var first = $readerContent.querySelector('.reader-highlight');
      if (first) { first.classList.add('reader-highlight-current'); first.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
  }
};

/* ══════════════════════════════════════════════════
   App.extract — AI Extract System
   ══════════════════════════════════════════════════ */
App.extract = {
  _promptsCache: null,
  _promptsCacheTime: 0,
  _PROMPTS_CACHE_TTL: 60000,
  _autoTranslate: false,

  /* Utility: focus-trap for modals */
  _trapFocus: function(container) {
    var FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    function getFocusable() {
      return Array.prototype.slice.call(container.querySelectorAll(FOCUSABLE)).filter(function(el) { return el.offsetParent !== null; });
    }
    function handler(e) {
      if (e.key !== 'Tab') return;
      var els = getFocusable();
      if (!els.length) return;
      var first = els[0], last = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    container.addEventListener('keydown', handler);
    return function release() { container.removeEventListener('keydown', handler); };
  },

  /* Utility: screen reader announce */
  _announce: function(msg) {
    var el = $('ai-sr-announce');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ai-sr-announce';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.className = 'sr-only';
      document.body.appendChild(el);
    }
    el.textContent = '';
    setTimeout(function() { el.textContent = msg; }, 50);
  },

  fetchPrompts: function(force) {
    if (!force && App.extract._promptsCache && (Date.now() - App.extract._promptsCacheTime < App.extract._PROMPTS_CACHE_TTL)) {
      return Promise.resolve(App.extract._promptsCache);
    }
    return fetch(PROMPTS_API)
      .then(function(r) { return r.ok ? r.json() : { prompts: [], defaultPromptId: null }; })
      .then(function(data) {
        App.extract._promptsCache = data;
        App.extract._promptsCacheTime = Date.now();
        return data;
      })
      .catch(function() { return { prompts: [], defaultPromptId: null }; });
  },

  _getEffectivePrompt: function(data, selectedId) {
    if (!selectedId || selectedId === '__builtin__') return BUILTIN_DEFAULT_PROMPT;
    var p = (data.prompts || []).find(function(x) { return x.id === selectedId; });
    return p ? p.text : BUILTIN_DEFAULT_PROMPT;
  },

  _getDefaultPromptId: function(data) {
    return data.defaultPromptId || '__builtin__';
  },

  callExtract: function(transcript, prompt, videoId, videoTitle, translate) {
    return fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: transcript, prompt: prompt, videoId: videoId, videoTitle: videoTitle, translate: !!translate })
    }).then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  },

  renderAIText: function(text) {
    if (!text) return '';
    var s = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/^### (.+)$/gm, '<h4 class="ai-heading">$1</h4>');
    s = s.replace(/^## (.+)$/gm, '<h3 class="ai-heading">$1</h3>');
    s = s.replace(/^# (.+)$/gm, '<h3 class="ai-heading">$1</h3>');
    s = s.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    s = s.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul class="ai-list">$1</ul>');
    s = s.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    s = s.replace(/\n{2,}/g, '</p><p>');
    s = s.replace(/\n/g, '<br>');
    return '<p>' + s + '</p>';
  },

  /* Pollinations AI image */
  _buildPollinationsUrl: function(prompt) {
    return POLLINATIONS_URL + encodeURIComponent(prompt) + '?width=768&height=432&nologo=true&seed=' + Math.floor(Math.random() * 100000);
  },

  _renderAIImage: function(videoId, imagePrompt) {
    if (!imagePrompt) return '<div class="ai-extract-image-wrap" data-vid="' + esc(videoId) + '"><div class="ai-extract-image-controls"><input type="text" class="ai-image-prompt-input" value="" placeholder="Describe the image you want..." aria-label="Image prompt"><button type="button" class="ai-image-retry-btn" title="Generate image">Generate</button></div></div>';
    var ep = esc(imagePrompt);
    var imgUrl = App.extract._buildPollinationsUrl(imagePrompt);
    return '<div class="ai-extract-image-wrap" data-vid="' + esc(videoId) + '">' +
      '<div class="ai-extract-image-container">' +
        '<img class="ai-extract-image" src="' + imgUrl + '" alt="AI concept image" loading="lazy">' +
        '<div class="ai-extract-image-loading"><span class="spinner"></span> Generating image...</div>' +
      '</div>' +
      '<div class="ai-extract-image-controls">' +
        '<input type="text" class="ai-image-prompt-input" value="' + ep + '" aria-label="Image prompt" title="Edit and press Retry">' +
        '<button type="button" class="ai-image-retry-btn" title="Regenerate image">Retry</button>' +
      '</div>' +
    '</div>';
  },

  _wireImageControls: function(container, videoId) {
    var retryBtn = container.querySelector('.ai-image-retry-btn');
    var promptInput = container.querySelector('.ai-image-prompt-input');
    var imgContainer = container.querySelector('.ai-extract-image-container');
    if (!retryBtn || !promptInput) return;

    function regenerate() {
      var newPrompt = promptInput.value.trim();
      if (!newPrompt) { showToast('Image prompt is empty', 'warning'); return; }
      var cached = App.state.aiExtractCache.get(videoId);
      if (cached) cached.imagePrompt = newPrompt;
      var newUrl = App.extract._buildPollinationsUrl(newPrompt);
      if (!imgContainer) {
        var wrap = container.querySelector('.ai-extract-image-wrap');
        if (wrap) {
          var div = document.createElement('div');
          div.className = 'ai-extract-image-container';
          wrap.insertBefore(div, wrap.firstChild);
          imgContainer = div;
        }
      }
      if (imgContainer) {
        imgContainer.innerHTML = '<img class="ai-extract-image" src="' + newUrl + '" alt="AI concept image" loading="lazy"><div class="ai-extract-image-loading"><span class="spinner"></span> Generating image...</div>';
        App.extract._wireImgLoad(imgContainer);
      }
      showToast('Generating image...', 'info');
    }

    retryBtn.addEventListener('click', regenerate);
    promptInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); regenerate(); } });
    if (imgContainer) App.extract._wireImgLoad(imgContainer);
  },

  _wireImgLoad: function(imgContainer) {
    var img = imgContainer.querySelector('.ai-extract-image');
    if (!img) return;
    img.addEventListener('load', function() { var ld = imgContainer.querySelector('.ai-extract-image-loading'); if (ld) ld.remove(); });
    img.addEventListener('error', function() { imgContainer.innerHTML = '<div class="ai-extract-image-error">Image generation failed - edit prompt and retry</div>'; });
  },

  /* Prompt Dropdown */
  createPromptDropdown: function(promptsData, triggerEl, onSelect) {
    var old = document.querySelector('.ai-prompt-dropdown');
    if (old) old.remove();

    var dropdown = document.createElement('div');
    dropdown.className = 'ai-prompt-dropdown';
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('aria-label', 'Select extraction prompt');

    var defaultId = App.extract._getDefaultPromptId(promptsData);
    var prompts = promptsData.prompts || [];

    var html = '<div class="ai-prompt-dropdown-title">Select prompt:</div>';
    html += '<button class="ai-prompt-option' + (defaultId === '__builtin__' ? ' selected' : '') + '" role="menuitem" tabindex="0" data-id="__builtin__">Default (built-in)</button>';
    prompts.forEach(function(p) {
      html += '<button class="ai-prompt-option' + (defaultId === p.id ? ' selected' : '') + '" role="menuitem" tabindex="-1" data-id="' + p.id + '">' + esc(p.name) + '</button>';
    });
    html += '<label class="ai-auto-translate-label"><input type="checkbox" class="ai-auto-translate-cb"' + (App.extract._autoTranslate ? ' checked' : '') + '> Auto-translate to Hebrew</label>';
    dropdown.innerHTML = html;

    var atCb = dropdown.querySelector('.ai-auto-translate-cb');
    if (atCb) atCb.addEventListener('change', function() { App.extract._autoTranslate = atCb.checked; });

    var items = dropdown.querySelectorAll('[role="menuitem"]');
    items.forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); closeDropdown(btn.dataset.id); });
    });

    dropdown.addEventListener('keydown', function(e) {
      var focused = document.activeElement;
      var idx = Array.prototype.indexOf.call(items, focused);
      if (e.key === 'ArrowDown' || e.key === 'Down') { e.preventDefault(); items[(idx + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp' || e.key === 'Up') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (focused && focused.dataset && focused.dataset.id) closeDropdown(focused.dataset.id); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeDropdown(null); }
    });

    function closeDropdown(selectedId) {
      dropdown.classList.add('ai-prompt-dropdown-closing');
      setTimeout(function() { dropdown.remove(); document.removeEventListener('mousedown', outsideHandler, true); if (triggerEl) triggerEl.focus(); }, 120);
      if (selectedId) onSelect(selectedId);
    }
    function outsideHandler(e) { if (!dropdown.contains(e.target) && e.target !== triggerEl) closeDropdown(null); }
    setTimeout(function() { document.addEventListener('mousedown', outsideHandler, true); }, 10);
    setTimeout(function() { var sel = dropdown.querySelector('.ai-prompt-option.selected') || items[0]; if (sel) sel.focus(); }, 30);

    return dropdown;
  },

  /* Tabs: Original / AI Extract / Hebrew */
  ensureTabs: function(videoId, section) {
    if (section.querySelector('.ai-tabs')) return;
    var transcriptEl = section.querySelector('.reader-section-transcript');
    if (!transcriptEl) return;

    var tablistId = 'ai-tablist-' + videoId;
    var panelOrigId = 'ai-panel-orig-' + videoId;
    var panelAiId = 'ai-panel-ai-' + videoId;
    var panelHeId = 'ai-panel-he-' + videoId;
    var tabOrigId = 'ai-tab-orig-' + videoId;
    var tabAiId = 'ai-tab-ai-' + videoId;
    var tabHeId = 'ai-tab-he-' + videoId;

    var tabs = document.createElement('div');
    tabs.className = 'ai-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Transcript view');
    tabs.id = tablistId;
    tabs.innerHTML =
      '<button class="ai-tab active" role="tab" id="' + tabOrigId + '" aria-selected="true" aria-controls="' + panelOrigId + '" tabindex="0" data-tab="original" data-vid="' + videoId + '">Original</button>' +
      '<button class="ai-tab" role="tab" id="' + tabAiId + '" aria-selected="false" aria-controls="' + panelAiId + '" tabindex="-1" data-tab="ai" data-vid="' + videoId + '">AI Extract</button>' +
      '<button class="ai-tab" role="tab" id="' + tabHeId + '" aria-selected="false" aria-controls="' + panelHeId + '" tabindex="-1" data-tab="hebrew" data-vid="' + videoId + '">\u05e2\u05d1\u05e8\u05d9\u05ea</button>';

    transcriptEl.parentNode.insertBefore(tabs, transcriptEl);
    transcriptEl.setAttribute('role', 'tabpanel');
    transcriptEl.setAttribute('aria-labelledby', tabOrigId);
    transcriptEl.id = panelOrigId;
    transcriptEl.setAttribute('tabindex', '0');

    var aiDiv = document.createElement('div');
    aiDiv.className = 'ai-extract-content';
    aiDiv.id = panelAiId;
    aiDiv.setAttribute('role', 'tabpanel');
    aiDiv.setAttribute('aria-labelledby', tabAiId);
    aiDiv.setAttribute('tabindex', '0');
    aiDiv.hidden = true;
    transcriptEl.parentNode.insertBefore(aiDiv, transcriptEl.nextSibling);

    var heDiv = document.createElement('div');
    heDiv.className = 'ai-extract-content ai-hebrew-content';
    heDiv.id = panelHeId;
    heDiv.setAttribute('role', 'tabpanel');
    heDiv.setAttribute('aria-labelledby', tabHeId);
    heDiv.setAttribute('tabindex', '0');
    heDiv.setAttribute('dir', 'rtl');
    heDiv.setAttribute('lang', 'he');
    heDiv.hidden = true;
    aiDiv.parentNode.insertBefore(heDiv, aiDiv.nextSibling);

    var tabButtons = tabs.querySelectorAll('[role="tab"]');
    tabButtons.forEach(function(tab) {
      tab.addEventListener('click', function() { App.extract.switchTab(videoId, section, tab.dataset.tab); });
    });

    tabs.addEventListener('keydown', function(e) {
      var tabArr = Array.prototype.slice.call(tabButtons);
      var idx = tabArr.indexOf(document.activeElement);
      if (idx < 0) return;
      if (e.key === 'ArrowRight' || e.key === 'Right') { e.preventDefault(); var n = tabArr[(idx + 1) % tabArr.length]; n.focus(); App.extract.switchTab(videoId, section, n.dataset.tab); }
      else if (e.key === 'ArrowLeft' || e.key === 'Left') { e.preventDefault(); var p = tabArr[(idx - 1 + tabArr.length) % tabArr.length]; p.focus(); App.extract.switchTab(videoId, section, p.dataset.tab); }
      else if (e.key === 'Home') { e.preventDefault(); tabArr[0].focus(); App.extract.switchTab(videoId, section, tabArr[0].dataset.tab); }
      else if (e.key === 'End') { e.preventDefault(); tabArr[tabArr.length - 1].focus(); App.extract.switchTab(videoId, section, tabArr[tabArr.length - 1].dataset.tab); }
    });
  },

  switchTab: function(videoId, section, tabName) {
    var tabButtons = section.querySelectorAll('[role="tab"]');
    tabButtons.forEach(function(t) {
      var isActive = t.dataset.tab === tabName;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      t.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    var transcriptEl = section.querySelector('.reader-section-transcript');
    var aiDiv = section.querySelector('.ai-extract-content:not(.ai-hebrew-content)');
    var heDiv = section.querySelector('.ai-hebrew-content');
    if (!transcriptEl) return;

    transcriptEl.hidden = true;
    if (aiDiv) aiDiv.hidden = true;
    if (heDiv) heDiv.hidden = true;

    if (tabName === 'ai') {
      if (aiDiv) {
        aiDiv.hidden = false;
        var cached = App.state.aiExtractCache.get(videoId);
        if (cached) {
          var translateBtnHtml = cached.translatedExtract
            ? '<button type="button" class="ai-translate-extract-btn translated" disabled>Translated</button>'
            : '<button type="button" class="ai-translate-extract-btn">Translate to Hebrew</button>';
          aiDiv.innerHTML =
            App.extract._renderAIImage(videoId, cached.imagePrompt) +
            '<div class="ai-extract-text">' + App.extract.renderAIText(cached.text) + '</div>' +
            (cached.translatedExtract
              ? '<div class="ai-translated-extract" dir="rtl" lang="he"><div class="ai-translated-header">Translation</div><div class="ai-extract-text">' + App.extract.renderAIText(cached.translatedExtract) + '</div></div>'
              : '') +
            translateBtnHtml +
            '<div class="ai-extract-model">Generated by ' + esc(cached.model) + '</div>';
          App.extract._wireImageControls(aiDiv, videoId);
          App.translate.wireTranslateExtractBtn(aiDiv, videoId);
        }
      }
    } else if (tabName === 'hebrew') {
      if (heDiv) {
        heDiv.hidden = false;
        var cached = App.state.aiExtractCache.get(videoId);
        if (cached && cached.translatedTranscript) {
          heDiv.innerHTML = '<div class="ai-extract-text" dir="rtl" lang="he">' + esc(cached.translatedTranscript) + '</div>' +
            '<div class="ai-extract-model">Translated via Groq</div>';
        } else {
          App.translate.translateTranscript(videoId, section, heDiv);
        }
      }
    } else {
      transcriptEl.hidden = false;
    }
  },

  /* Inject extract buttons into reader sections */
  injectExtractButtons: function() {
    var sections = document.querySelectorAll('.reader-section');
    sections.forEach(function(section) {
      var header = section.querySelector('.reader-section-header');
      if (!header || header.querySelector('.ai-extract-btn')) return;
      var sectionId = section.id.replace('reader-section-', '');

      var extractBtn = document.createElement('button');
      extractBtn.type = 'button';
      extractBtn.className = 'ai-extract-btn';
      extractBtn.setAttribute('aria-label', 'AI Extract Best for this video');
      extractBtn.title = 'AI Extract Best';
      extractBtn.innerHTML = STAR_ICON + ' Extract';
      extractBtn.dataset.videoId = sectionId;

      var copyBtn = header.querySelector('.reader-copy-btn');
      if (copyBtn) header.insertBefore(extractBtn, copyBtn);
      else header.appendChild(extractBtn);

      App.extract.ensureTabs(sectionId, section);

      extractBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        App.extract._handleExtractClick(sectionId, section, extractBtn);
      });
    });
  },

  _handleExtractClick: function(videoId, section, btn) {
    if (App.state.aiExtractCache.has(videoId)) {
      App.extract.ensureTabs(videoId, section);
      App.extract.switchTab(videoId, section, 'ai');
      return;
    }

    var existingDd = btn.parentElement.querySelector('.ai-prompt-dropdown');
    if (existingDd) { existingDd.remove(); return; }

    App.extract.fetchPrompts().then(function(data) {
      var prompts = data.prompts || [];
      if (prompts.length === 0) {
        App.extract._doExtract(videoId, section, btn, BUILTIN_DEFAULT_PROMPT);
      } else {
        var dd = App.extract.createPromptDropdown(data, btn, function(selectedId) {
          var promptText = App.extract._getEffectivePrompt(data, selectedId);
          App.extract._doExtract(videoId, section, btn, promptText);
        });
        btn.parentElement.style.position = 'relative';
        btn.parentElement.appendChild(dd);
        var rect = btn.getBoundingClientRect();
        var parentRect = btn.parentElement.getBoundingClientRect();
        dd.style.top = (rect.bottom - parentRect.top + 4) + 'px';
        dd.style.right = '0';
      }
    });
  },

  _doExtract: function(videoId, section, btn, promptText) {
    var transcriptEl = section.querySelector('.reader-section-transcript');
    if (!transcriptEl) { showToast('No transcript available', 'warning'); return; }
    var transcript = transcriptEl.textContent;
    if (!transcript || transcript.trim().length < 50) { showToast('Transcript too short', 'warning'); return; }

    var titleEl = section.querySelector('.reader-section-title a');
    var videoTitle = titleEl ? titleEl.textContent : '';

    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="spinner"></span> Extracting...';
    section.classList.add('ai-extracting');
    App.extract._announce('Extracting transcript for ' + videoTitle);

    App.extract.callExtract(transcript, promptText, videoId, videoTitle, App.extract._autoTranslate)
      .then(function(data) {
        var result = data.result || data.output || 'No result returned';
        var cacheEntry = { text: result, model: data.model || 'AI', imagePrompt: data.imagePrompt || '' };
        if (data.translatedResult) cacheEntry.translatedExtract = data.translatedResult;
        App.state.aiExtractCache.set(videoId, cacheEntry);
        App.storage.saveAICache();
        App.extract.ensureTabs(videoId, section);
        App.extract.switchTab(videoId, section, 'ai');
        App.extract._resetBtn(btn);
        section.classList.remove('ai-extracting');
        App.extract._announce('Extraction complete for ' + videoTitle);
        showToast('Extraction complete!', 'success');
      })
      .catch(function(err) {
        showToast('Extraction failed: ' + err.message, 'error');
        App.extract._resetBtn(btn);
        section.classList.remove('ai-extracting');
      });
  },

  _resetBtn: function(btn) {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.innerHTML = STAR_ICON + ' Extract';
  },

  /* Batch extract */
  batchExtract: function(videoIds) {
    App.extract.fetchPrompts().then(function(data) {
      var prompts = data.prompts || [];
      if (prompts.length === 0) {
        App.extract._doBatchExtract(videoIds, BUILTIN_DEFAULT_PROMPT);
      } else {
        /* Show prompt dropdown anchored to fab extract button */
        var fabExtract = $('fab-extract');
        if (!fabExtract) { App.extract._doBatchExtract(videoIds, BUILTIN_DEFAULT_PROMPT); return; }
        var dd = App.extract.createPromptDropdown(data, fabExtract, function(selectedId) {
          var promptText = App.extract._getEffectivePrompt(data, selectedId);
          App.extract._doBatchExtract(videoIds, promptText);
        });
        dd.classList.add('ai-batch-dropdown');
        var bar = $('floating-action-bar');
        if (bar) {
          bar.style.position = 'relative';
          dd.style.bottom = '100%';
          dd.style.top = 'auto';
          dd.style.marginBottom = '8px';
          bar.appendChild(dd);
        }
      }
    });
  },

  _doBatchExtract: function(videoIds, promptText) {
    var total = videoIds.length;
    var current = 0;
    var succeeded = 0;
    var fabExtract = $('fab-extract');
    if (fabExtract) { fabExtract.disabled = true; fabExtract.setAttribute('aria-busy', 'true'); }
    App.extract._announce('Starting batch extraction of ' + total + ' videos');

    function next() {
      if (current >= total) {
        if (fabExtract) { fabExtract.disabled = false; fabExtract.removeAttribute('aria-busy'); fabExtract.innerHTML = STAR_ICON + ' Extract Best'; }
        showToast('Extracted ' + succeeded + '/' + total + ' video(s)', 'success');
        return;
      }
      var videoId = videoIds[current];
      current++;
      if (fabExtract) fabExtract.innerHTML = '<span class="spinner"></span> Extracting ' + current + '/' + total + '...';

      if (App.state.aiExtractCache.has(videoId)) {
        var sec = $('reader-section-' + videoId);
        if (sec) { App.extract.ensureTabs(videoId, sec); App.extract.switchTab(videoId, sec, 'ai'); }
        succeeded++;
        next();
        return;
      }

      var section = $('reader-section-' + videoId);
      if (!section) { next(); return; }
      var transcriptEl = section.querySelector('.reader-section-transcript');
      if (!transcriptEl) { next(); return; }

      var transcript = transcriptEl.textContent;
      var titleEl = section.querySelector('.reader-section-title a');
      var videoTitle = titleEl ? titleEl.textContent : '';
      section.classList.add('ai-extracting');

      App.extract.callExtract(transcript, promptText, videoId, videoTitle, App.extract._autoTranslate)
        .then(function(data) {
          var result = data.result || data.output || 'No result returned';
          var cacheEntry = { text: result, model: data.model || 'AI', imagePrompt: data.imagePrompt || '' };
          if (data.translatedResult) cacheEntry.translatedExtract = data.translatedResult;
          App.state.aiExtractCache.set(videoId, cacheEntry);
          App.storage.saveAICache();
          App.extract.ensureTabs(videoId, section);
          App.extract.switchTab(videoId, section, 'ai');
          section.classList.remove('ai-extracting');
          succeeded++;
        })
        .catch(function() { section.classList.remove('ai-extracting'); })
        .finally(next);
    }
    next();
  }
};

/* ══════════════════════════════════════════════════
   App.translate
   ══════════════════════════════════════════════════ */
App.translate = {
  translateTranscript: function(videoId, section, heDiv) {
    var transcriptEl = section.querySelector('.reader-section-transcript');
    if (!transcriptEl) return;
    var text = transcriptEl.textContent;
    if (!text || text.trim().length < 10) {
      heDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-dim)">No transcript to translate</div>';
      return;
    }

    heDiv.innerHTML = '<div style="text-align:center;padding:30px"><span class="spinner"></span> Translating...</div>';

    fetch(API + '/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, targetLang: 'he', videoId: videoId })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) throw new Error(data.error);
      var cached = App.state.aiExtractCache.get(videoId) || {};
      cached.translatedTranscript = data.translated;
      App.state.aiExtractCache.set(videoId, cached);
      App.storage.saveAICache();
      heDiv.innerHTML = '<div class="ai-extract-text" dir="rtl" lang="he">' + esc(data.translated) + '</div>' +
        '<div class="ai-extract-model">Translated by ' + esc(data.model || 'Groq') + '</div>';
      showToast('Translation complete!', 'success');
    })
    .catch(function(err) {
      heDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--accent)">Translation failed: ' + esc(err.message) + '</div>';
      showToast('Translation failed', 'error');
    });
  },

  wireTranslateExtractBtn: function(container, videoId) {
    var btn = container.querySelector('.ai-translate-extract-btn:not(.translated)');
    if (!btn) return;
    btn.addEventListener('click', function() {
      var cached = App.state.aiExtractCache.get(videoId);
      if (!cached || !cached.text) return;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Translating...';

      fetch(API + '/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cached.text, targetLang: 'he', videoId: videoId })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error);
        cached.translatedExtract = data.translated;
        App.state.aiExtractCache.set(videoId, cached);
        App.storage.saveAICache();
        var section = $('reader-section-' + videoId);
        if (section) App.extract.switchTab(videoId, section, 'ai');
        showToast('AI Extract translated!', 'success');
      })
      .catch(function(err) {
        btn.disabled = false;
        btn.innerHTML = 'Translate to Hebrew';
        showToast('Translation failed: ' + err.message, 'error');
      });
    });
  },

  batchTranslateSelected: function(videoIds) {
    var total = videoIds.length;
    var current = 0;
    var succeeded = 0;
    var fabTranslate = $('fab-translate');
    if (fabTranslate) { fabTranslate.disabled = true; fabTranslate.setAttribute('aria-busy', 'true'); }

    function next() {
      if (current >= total) {
        if (fabTranslate) { fabTranslate.disabled = false; fabTranslate.removeAttribute('aria-busy'); fabTranslate.innerHTML = 'Translate'; }
        showToast('Translated ' + succeeded + '/' + total + ' transcripts', 'success');
        return;
      }
      var videoId = videoIds[current];
      current++;
      if (fabTranslate) fabTranslate.innerHTML = '<span class="spinner"></span> Translating ' + current + '/' + total + '...';

      var cached = App.state.aiExtractCache.get(videoId);
      if (cached && cached.translatedTranscript) { succeeded++; next(); return; }

      var section = $('reader-section-' + videoId);
      if (!section) { next(); return; }
      var transcriptEl = section.querySelector('.reader-section-transcript');
      if (!transcriptEl) { next(); return; }
      var text = transcriptEl.textContent;
      if (!text || text.trim().length < 10) { next(); return; }

      fetch(API + '/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, targetLang: 'he', videoId: videoId })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error);
        var c = App.state.aiExtractCache.get(videoId) || {};
        c.translatedTranscript = data.translated;
        App.state.aiExtractCache.set(videoId, c);
        App.storage.saveAICache();
        succeeded++;
      })
      .catch(function() {})
      .finally(next);
    }
    next();
  }
};

/* ══════════════════════════════════════════════════
   App.prompts — Prompt Manager Modal
   ══════════════════════════════════════════════════ */
App.prompts = {
  _triggerEl: null,
  _releaseTrap: null,

  openPromptManager: function(triggerElement) {
    App.prompts._triggerEl = triggerElement || document.activeElement;

    var existing = $('prompt-manager-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'prompt-manager-modal';
    modal.className = 'pm-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Prompt Manager');
    modal.innerHTML =
      '<div class="pm-backdrop"></div>' +
      '<div class="pm-modal">' +
        '<div class="pm-header">' +
          '<h2 class="pm-title" id="pm-dialog-title">Prompt Manager</h2>' +
          '<button class="pm-close" type="button" aria-label="Close prompt manager">&times;</button>' +
        '</div>' +
        '<div class="pm-body" id="pm-body" tabindex="-1"><div class="pm-loading"><span class="spinner"></span> Loading prompts...</div></div>' +
        '<div class="pm-footer">' +
          '<button class="pm-add-btn" id="pm-add-btn" type="button">+ Add New Prompt</button>' +
        '</div>' +
      '</div>';

    modal.setAttribute('aria-labelledby', 'pm-dialog-title');
    document.body.appendChild(modal);
    document.body.classList.add('pm-open');

    App.prompts._releaseTrap = App.extract._trapFocus(modal.querySelector('.pm-modal'));

    var closeBtn = modal.querySelector('.pm-close');
    setTimeout(function() { closeBtn.focus(); }, 50);

    modal.querySelector('.pm-backdrop').addEventListener('click', App.prompts.closePromptManager);
    closeBtn.addEventListener('click', App.prompts.closePromptManager);

    function escHandler(e) {
      if (e.key === 'Escape') {
        var editor = modal.querySelector('.pm-editor');
        if (editor) { editor.remove(); return; }
        App.prompts.closePromptManager();
      }
    }
    document.addEventListener('keydown', escHandler);
    modal._escHandler = escHandler;

    App.extract.fetchPrompts(true).then(App.prompts._renderList);
    modal.querySelector('#pm-add-btn').addEventListener('click', function() { App.prompts._showEditor(null); });
  },

  closePromptManager: function() {
    var modal = $('prompt-manager-modal');
    if (!modal) return;
    modal.classList.add('pm-overlay-closing');
    if (modal._escHandler) document.removeEventListener('keydown', modal._escHandler);
    if (App.prompts._releaseTrap) { App.prompts._releaseTrap(); App.prompts._releaseTrap = null; }
    document.body.classList.remove('pm-open');
    setTimeout(function() {
      modal.remove();
      if (App.prompts._triggerEl && App.prompts._triggerEl.focus) {
        try { App.prompts._triggerEl.focus(); } catch(e) {}
      }
      App.prompts._triggerEl = null;
    }, 150);
  },

  _renderList: function(data) {
    var body = $('pm-body');
    if (!body) return;
    var prompts = data.prompts || [];
    var defaultId = data.defaultPromptId || null;
    var html = '';

    html += '<div class="pm-item pm-item-builtin">' +
      '<div class="pm-item-header">' +
        '<span class="pm-item-star active" aria-label="Default prompt (built-in)" title="Built-in default">&#9733;</span>' +
        '<span class="pm-item-name">Default (built-in)</span>' +
        '<span class="pm-item-badge">Built-in</span>' +
      '</div>' +
      '<div class="pm-item-preview">' + esc(BUILTIN_DEFAULT_PROMPT).substring(0, 150) + '...</div>' +
    '</div>';

    prompts.forEach(function(p) {
      var isDefault = (p.id === defaultId);
      html += '<div class="pm-item" data-id="' + p.id + '">' +
        '<div class="pm-item-header">' +
          '<button class="pm-item-star' + (isDefault ? ' active' : '') + '" data-id="' + p.id + '" aria-label="' + (isDefault ? 'Default prompt' : 'Set as default prompt') + '" title="' + (isDefault ? 'Current default' : 'Set as default') + '">&#9733;</button>' +
          '<span class="pm-item-name">' + esc(p.name) + '</span>' +
          '<div class="pm-item-actions">' +
            '<button class="pm-item-edit" data-id="' + p.id + '" aria-label="Edit prompt" title="Edit">&#9998;</button>' +
            '<button class="pm-item-delete" data-id="' + p.id + '" aria-label="Delete prompt" title="Delete">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div class="pm-item-preview">' + esc((p.text || '').substring(0, 150)) + (p.text && p.text.length > 150 ? '...' : '') + '</div>' +
      '</div>';
    });

    if (prompts.length === 0) html += '<div class="pm-empty">No custom prompts yet. Add one below.</div>';
    body.innerHTML = html;

    body.querySelectorAll('.pm-item-star[data-id]').forEach(function(star) {
      star.addEventListener('click', function() { App.prompts._setDefault(star.dataset.id); });
    });
    body.querySelectorAll('.pm-item-edit').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var p = (App.extract._promptsCache.prompts || []).find(function(x) { return x.id === btn.dataset.id; });
        if (p) App.prompts._showEditor(p);
      });
    });
    body.querySelectorAll('.pm-item-delete').forEach(function(btn) {
      btn.addEventListener('click', function() { App.prompts._deletePrompt(btn.dataset.id); });
    });
  },

  _setDefault: function(id) {
    fetch(PROMPTS_API + '/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isDefault: true }) })
      .then(function(r) { return r.json(); })
      .then(function() { showToast('Default prompt updated', 'success'); App.extract.fetchPrompts(true).then(App.prompts._renderList); })
      .catch(function(err) { showToast('Failed: ' + err.message, 'error'); });
  },

  _deletePrompt: function(id) {
    App.confirm.show({
      title: 'Delete Prompt',
      message: 'Are you sure you want to delete this prompt?',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: function() {
        fetch(PROMPTS_API + '/' + id, { method: 'DELETE' })
          .then(function(r) { if (!r.ok) throw new Error('Delete failed'); showToast('Prompt deleted', 'success'); return App.extract.fetchPrompts(true); })
          .then(App.prompts._renderList)
          .catch(function(err) { showToast('Failed: ' + err.message, 'error'); });
      }
    });
  },

  _showEditor: function(existingPrompt) {
    var body = $('pm-body');
    if (!body) return;
    var isEdit = !!existingPrompt;
    var nameVal = isEdit ? existingPrompt.name : '';
    var textVal = isEdit ? existingPrompt.text : '';

    var existingEditor = body.querySelector('.pm-editor');
    if (existingEditor) existingEditor.remove();

    var editor = document.createElement('div');
    editor.className = 'pm-editor';
    editor.setAttribute('role', 'group');
    editor.setAttribute('aria-label', isEdit ? 'Edit prompt' : 'Create new prompt');
    editor.innerHTML =
      '<div class="pm-editor-title">' + (isEdit ? 'Edit Prompt' : 'New Prompt') + '</div>' +
      '<label class="pm-editor-label" for="pm-edit-name">Name</label>' +
      '<input class="pm-editor-name" id="pm-edit-name" type="text" placeholder="Prompt name..." value="' + esc(nameVal) + '" autocomplete="off">' +
      '<label class="pm-editor-label" for="pm-edit-text">Prompt text</label>' +
      '<textarea class="pm-editor-text" id="pm-edit-text" rows="6" placeholder="Enter your extraction prompt...">' + esc(textVal) + '</textarea>' +
      '<div class="pm-editor-actions">' +
        '<button class="pm-editor-save" type="button">' + (isEdit ? 'Save Changes' : 'Create Prompt') + '</button>' +
        '<button class="pm-editor-cancel" type="button">Cancel</button>' +
      '</div>';

    body.appendChild(editor);
    editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    var nameInput = editor.querySelector('.pm-editor-name');
    setTimeout(function() { nameInput.focus(); }, 50);

    editor.querySelector('.pm-editor-cancel').addEventListener('click', function() {
      editor.classList.add('pm-editor-closing');
      setTimeout(function() { editor.remove(); }, 150);
    });

    nameInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); editor.querySelector('.pm-editor-text').focus(); } });
    editor.querySelector('.pm-editor-text').addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); editor.querySelector('.pm-editor-save').click(); }
    });

    editor.querySelector('.pm-editor-save').addEventListener('click', function() {
      var name = editor.querySelector('.pm-editor-name').value.trim();
      var text = editor.querySelector('.pm-editor-text').value.trim();
      if (!name || !text) { showToast('Name and text are required', 'warning'); if (!name) nameInput.focus(); return; }

      var saveBtn = editor.querySelector('.pm-editor-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      var url = isEdit ? PROMPTS_API + '/' + existingPrompt.id : PROMPTS_API;
      var method = isEdit ? 'PUT' : 'POST';

      fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, text: text }) })
        .then(function(r) { if (!r.ok) throw new Error('Save failed'); return App.extract.fetchPrompts(true); })
        .then(function(data) { App.prompts._renderList(data); showToast(isEdit ? 'Prompt updated!' : 'Prompt created!', 'success'); })
        .catch(function(err) {
          showToast('Failed: ' + err.message, 'error');
          saveBtn.disabled = false;
          saveBtn.textContent = isEdit ? 'Save Changes' : 'Create Prompt';
        });
    });
  }
};

/* ══════════════════════════════════════════════════
   App.apiStatus
   ══════════════════════════════════════════════════ */
App.apiStatus = {
  _esc: function(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _fmtTokens: function(n) {
    if (n == null || n === '') return '?';
    n = Number(n);
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return String(n);
  },

  _pct: function(remaining, limit) {
    if (!remaining || !limit) return 0;
    return Math.round((Number(remaining) / Number(limit)) * 100);
  },

  _barColor: function(p) {
    if (p > 60) return 'var(--green, #22c55e)';
    if (p > 25) return 'var(--yellow, #eab308)';
    return 'var(--accent, #ef4444)';
  },

  initBtn: function() {
    var btn = $('api-status-btn');
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var existing = document.querySelector('.api-status-dropdown');
      if (existing) { existing.remove(); return; }
      App.apiStatus.showDropdown(btn);
    });
  },

  showDropdown: function(anchor) {
    var self = App.apiStatus;
    var dd = document.createElement('div');
    dd.className = 'api-status-dropdown';
    dd.innerHTML = '<div class="groq-pop-loading"><span class="spinner"></span> Loading...</div>';
    document.body.appendChild(dd);

    var rect = anchor.getBoundingClientRect();
    dd.style.top = (rect.bottom + 6) + 'px';
    dd.style.right = (window.innerWidth - rect.right) + 'px';

    function outsideClick(e) {
      if (!dd.contains(e.target) && !anchor.contains(e.target)) {
        dd.remove();
        document.removeEventListener('mousedown', outsideClick, true);
      }
    }
    setTimeout(function() { document.addEventListener('mousedown', outsideClick, true); }, 10);

    fetch(API + '/groq-status')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error);
        var html = '';

        /* Groq */
        var groq = data.groq || {};
        var groqKeys = groq.keys || [];
        if (groqKeys.length > 0) {
          html += '<div class="groq-pop-section-title">Groq (' + groqKeys.length + ' keys)</div>';
          groqKeys.forEach(function(k) {
            var tokPct = self._pct(k.tokensRemaining, k.tokensLimit);
            var reqPct = self._pct(k.requestsRemaining, k.requestsLimit);
            var statusClass = k.status === 'active' ? 'groq-key-active' : 'groq-key-error';
            html += '<div class="groq-key-item">' +
              '<div class="groq-key-header"><span class="groq-key-label ' + statusClass + '">' + self._esc(k.label) + '</span><span class="groq-key-status-dot ' + statusClass + '"></span></div>' +
              '<div class="groq-key-row"><span class="groq-key-metric">Tokens</span><div class="groq-bar-wrap"><div class="groq-bar" style="width:' + tokPct + '%;background:' + self._barColor(tokPct) + '"></div></div><span class="groq-key-val">' + self._fmtTokens(k.tokensRemaining) + '/' + self._fmtTokens(k.tokensLimit) + '</span></div>' +
              '<div class="groq-key-row"><span class="groq-key-metric">Reqs</span><div class="groq-bar-wrap"><div class="groq-bar" style="width:' + reqPct + '%;background:' + self._barColor(reqPct) + '"></div></div><span class="groq-key-val">' + self._fmtTokens(k.requestsRemaining) + '/' + self._fmtTokens(k.requestsLimit) + '</span></div>' +
            '</div>';
          });
        }

        /* Apify */
        var apify = data.apify || {};
        var apifyAccounts = apify.accounts || [];
        var activeCount = 0;
        if (apifyAccounts.length > 0) {
          var totalRemaining = 0, totalLimit = 0;
          apifyAccounts.forEach(function(a) {
            if (a.status === 'active' || a.status === 'exhausted') {
              totalRemaining += (a.remainingUsd || 0);
              totalLimit += (a.limitUsd || 0);
              if (a.status === 'active') activeCount++;
            }
          });
          html += '<div class="groq-pop-section-title apify-section-title">Apify (' + activeCount + '/' + apifyAccounts.length + ' active)</div>';
          html += '<div class="apify-summary"><span class="apify-summary-label">Remaining:</span><span class="apify-summary-val">$' + totalRemaining.toFixed(2) + ' / $' + totalLimit.toFixed(2) + '</span></div>';
          apifyAccounts.forEach(function(a) {
            if (a.status === 'error') {
              html += '<div class="groq-key-item"><span class="groq-key-label groq-key-error">' + self._esc(a.label) + ' -- ' + (a.error || 'error') + '</span></div>';
              return;
            }
            var isExhausted = a.status === 'exhausted';
            var remainPct = a.limitUsd > 0 ? self._pct(a.remainingUsd, a.limitUsd) : 0;
            var statusClass = isExhausted ? 'groq-key-error' : 'groq-key-active';
            var statusTag = isExhausted ? ' <span style="color:#ef4444;font-size:10px;font-weight:700">EXHAUSTED</span>' : '';
            html += '<div class="groq-key-item' + (isExhausted ? ' apify-exhausted' : '') + '">' +
              '<div class="groq-key-header"><span class="groq-key-label ' + statusClass + '">' + self._esc(a.label) + statusTag + '</span></div>' +
              '<div class="groq-key-row"><span class="groq-key-metric">Budget</span><div class="groq-bar-wrap"><div class="groq-bar" style="width:' + remainPct + '%;background:' + self._barColor(remainPct) + '"></div></div><span class="groq-key-val">$' + (a.usedUsd || 0).toFixed(2) + '/$' + (a.limitUsd || 0).toFixed(0) + '</span></div>' +
              (a.lastRunCost != null ? '<div class="groq-key-reset">Last scrape: $' + a.lastRunCost.toFixed(4) + '</div>' : '') +
              (a.cycleEnd ? '<div class="groq-key-reset">Resets: ' + new Date(a.cycleEnd).toLocaleDateString() + '</div>' : '') +
            '</div>';
          });
        }

        /* Update header dot */
        var dot = $('api-status-dot');
        if (dot) {
          var allOk = activeCount === apifyAccounts.length && groqKeys.every(function(k) { return k.status === 'active'; });
          var allBad = activeCount === 0;
          dot.className = 'status-dot ' + (allOk ? 'dot-ok' : (allBad ? 'dot-bad' : 'dot-warn'));
        }

        html += '<div class="groq-pop-time">' + new Date(data.timestamp).toLocaleTimeString() + '</div>';
        dd.innerHTML = html;
      })
      .catch(function(err) {
        dd.innerHTML = '<div class="groq-pop-error">Failed: ' + self._esc(err.message) + '</div>';
      });
  }
};

/* ══════════════════════════════════════════════════
   App.export
   ══════════════════════════════════════════════════ */
App.export = {
  wire: function() {
    var btn = $('export-btn');
    var menu = $('export-menu');
    if (!btn || !menu) return;

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var open = !menu.hidden;
      menu.hidden = open;
      btn.setAttribute('aria-expanded', !open);
    });
    document.addEventListener('click', function() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    });
    menu.querySelectorAll('button').forEach(function(b) {
      b.addEventListener('click', function() {
        var fmt = b.dataset.format;
        window.open(API + '/export?format=' + fmt, '_blank');
        menu.hidden = true;
      });
    });
  }
};

/* ══════════════════════════════════════════════════
   App.viewToggle
   ══════════════════════════════════════════════════ */
App.viewToggle = {
  wire: function() {
    var toggle = $('view-toggle');
    if (!toggle) return;

    /* Set initial state from prefs */
    var btns = toggle.querySelectorAll('.vtf-btn');
    btns.forEach(function(b) {
      b.classList.toggle('active', b.dataset.view === App.state.currentView);
    });

    /* Apply initial view */
    if (App.state.currentView === 'reader') {
      App.reader.showReaderView();
    }

    btns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var view = btn.dataset.view;
        if (view === App.state.currentView) return;
        App.state.currentView = view;
        App.storage.savePrefs();

        btns.forEach(function(b) { b.classList.toggle('active', b.dataset.view === view); });

        if (view === 'reader') {
          App.reader.showReaderView();
        } else {
          App.reader.showCardsView();
        }
      });
    });
  }
};

/* ══════════════════════════════════════════════════
   init() — Boot Sequence
   ══════════════════════════════════════════════════ */
function init() {
  /* 1. Load preferences */
  App.storage.loadPrefs();
  App.storage.loadAICache();
  App.storage.loadTranscriptCache();

  /* Apply sort preference */
  var $sortSel = $('sort-select');
  if ($sortSel) $sortSel.value = App.state.sortBy;

  /* Apply archive toggle */
  var $showArchived = $('show-archived');
  if ($showArchived) $showArchived.checked = App.state.showArchived;

  /* 2. Fetch videos */
  fetch(API + '/videos')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      App.state.allVideos = data.videos || [];
      App.state.channels = data.channels || {};

      /* 3. Build UI */
      App.sidebar.buildTopics();
      App.sidebar.buildChannels();
      App.cards.render();
      App.stats.render();

      /* 4. Wire events */
      wireEvents();

      /* 5. Handle hash navigation */
      handleHash();
      window.addEventListener('hashchange', handleHash);
    })
    .catch(function(e) {
      var $cards = $('cards');
      if ($cards) $cards.innerHTML = '<p style="color:#ef4444;padding:40px;text-align:center">Failed to load data: ' + esc(e.message) + '</p>';
    });
}

function handleHash() {
  var h = location.hash;
  if (h.startsWith('#video/')) {
    App.drawer.open(decodeURIComponent(h.slice(7)));
  } else if (!$('drawer').hidden) {
    App.drawer.close();
  }
}

function wireEvents() {
  /* Drawer */
  $('drawer-close').addEventListener('click', App.drawer.close);
  $('drawer-backdrop').addEventListener('click', App.drawer.close);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !$('drawer').hidden) App.drawer.close();
  });

  /* Drawer scroll-to-top */
  var $dPanel = $('drawer-panel');
  var $dScrollTop = $('drawer-scroll-top');
  if ($dPanel && $dScrollTop) {
    $dPanel.addEventListener('scroll', function() {
      if ($dPanel.scrollTop > 300) $dScrollTop.classList.add('visible');
      else $dScrollTop.classList.remove('visible');
    });
    $dScrollTop.addEventListener('click', function() { $dPanel.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  /* Search */
  App.search.wire();

  /* Sort */
  var $sortSel = $('sort-select');
  if ($sortSel) {
    $sortSel.addEventListener('change', function() {
      App.state.sortBy = $sortSel.value;
      App.storage.savePrefs();
      App.cards.render();
    });
  }

  /* Select mode */
  var $selectBtn = $('select-mode-btn');
  if ($selectBtn) $selectBtn.addEventListener('click', function() { App.selection.toggleSelectMode(); });

  /* Export */
  App.export.wire();

  /* Scrape */
  App.scrape.wire();

  /* View toggle */
  App.viewToggle.wire();

  /* API status */
  App.apiStatus.initBtn();

  /* Confirm dialog */
  App.confirm._wire();

  /* Archive toggle in sidebar */
  var $showArchived = $('show-archived');
  if ($showArchived) {
    $showArchived.addEventListener('change', function() {
      App.state.showArchived = $showArchived.checked;
      App.storage.savePrefs();
      App.cards.render();
      App.sidebar.buildTopics();
      App.sidebar.buildChannels();
      App.stats.render();
    });
  }

  /* Reader content observer for injecting controls */
  var readerContent = $('reader-content');
  if (readerContent) {
    var observer = new MutationObserver(function() {
      App.reader._injectControls();
      App.extract.injectExtractButtons();
    });
    observer.observe(readerContent, { childList: true, subtree: false });
  }
}

/* ── Start ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* Expose for external access */
window.aiExtract = {
  openPromptManager: App.prompts.openPromptManager,
  cache: App.state.aiExtractCache
};
window.readerView = {
  show: App.reader.showReaderView,
  hide: App.reader.showCardsView,
  reload: function() { App.reader._loaded = false; App.reader.loadAllTranscripts(); }
};
