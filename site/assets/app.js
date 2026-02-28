/* YT Research — app.js */
'use strict';

let allVideos = [];
let channels = {};
let topics = {};
let filterTopic = null;
let filterChannel = null;
let query = '';
let sortBy = 'date';

const API = 'https://yt-research-api.nadavf.workers.dev/api';

/* ── Helpers ── */
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

/* ── DOM refs ── */
var $ = function(id) { return document.getElementById(id); };
var $cards    = $('cards');
var $empty    = $('empty');
var $count    = $('count');
var $topics   = $('topics');
var $channels = $('channels');
var $search   = $('search');
var $sortSel  = $('sort-select');
var $filters  = $('filters');
var $info     = $('result-info');
var $drawer   = $('drawer');
var $dHead    = $('drawer-head');
var $dBody    = $('drawer-body');
var $dClose   = $('drawer-close');
var $dBack    = $('drawer-backdrop');
var $dPanel   = $('drawer-panel');
var $dScrollTop = $('drawer-scroll-top');
var $exportBtn  = $('export-btn');
var $exportMenu = $('export-menu');

/* ── Boot ── */
function init() {
  fetch(API + '/videos')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      allVideos = data.videos || [];
      channels = data.channels || {};
      buildTopics();
      buildChannels();
      render();
      wireEvents();
      handleHash();
      window.addEventListener('hashchange', handleHash);
    })
    .catch(function(e) {
      if ($cards) $cards.innerHTML = '<p style="color:#ef4444;padding:40px;text-align:center">Failed to load data: ' + esc(e.message) + '</p>';
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ── Filter + sort ── */
function getFiltered() {
  var list = allVideos.filter(function(v) {
    if (filterTopic && v.topic !== filterTopic) return false;
    if (filterChannel && v.channelId !== filterChannel) return false;
    if (query) {
      var q = query.toLowerCase();
      var t = (v.title || '').toLowerCase();
      var d = (v.description || '').toLowerCase();
      var ch = channels[v.channelId] ? channels[v.channelId].name.toLowerCase() : '';
      if (!t.includes(q) && !d.includes(q) && !ch.includes(q)) return false;
    }
    return true;
  });

  list.sort(function(a, b) {
    if (sortBy === 'views') return (b.viewCount || 0) - (a.viewCount || 0);
    if (sortBy === 'likes') return (b.likes || 0) - (a.likes || 0);
    if (sortBy === 'duration') return (b.durationSeconds || 0) - (a.durationSeconds || 0);
    if (sortBy === 'words') return (b.transcriptWordCount || 0) - (a.transcriptWordCount || 0);
    return new Date(b.date) - new Date(a.date);
  });

  return list;
}

/* ── Render cards ── */
function render() {
  var list = getFiltered();

  $count.textContent = allVideos.length;
  $info.textContent = list.length === allVideos.length
    ? list.length + ' videos'
    : list.length + ' of ' + allVideos.length + ' videos';
  updateFilters();

  if (!list.length) {
    $cards.innerHTML = '';
    $empty.hidden = false;
    return;
  }
  $empty.hidden = true;
  $cards.innerHTML = list.map(cardHtml).join('');

  $cards.querySelectorAll('.card').forEach(function(el) {
    el.addEventListener('click', function() { openEntry(el.dataset.id); });
    el.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEntry(el.dataset.id); }
    });
  });
}

function cardHtml(v) {
  var ch = channels[v.channelId];
  var chName = ch ? esc(ch.name) : '';
  var thumb = v.thumbnailUrl
    ? '<img class="card-thumb" src="' + esc(v.thumbnailUrl) + '" alt="" loading="lazy">'
    : '<div class="card-thumb-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none"><polygon points="10,8 10,16 16,12" fill="currentColor"/></svg></div>';

  var badges = '';
  if (v.hasTranscript) {
    badges += '<span class="card-badge badge-transcript">' + fmtNum(v.transcriptWordCount) + ' words</span>';
  } else {
    badges += '<span class="card-badge badge-no-transcript">No transcript</span>';
  }
  if (v.summary) {
    badges += '<span class="card-badge badge-summary">Summarized</span>';
  }

  var topicColor = '#888';
  if (topics[v.topic]) topicColor = topics[v.topic].color || '#888';

  return '<article class="card" data-id="' + esc(v.id) + '" tabindex="0" role="button" aria-label="' + esc(v.title) + '">' +
    thumb +
    '<div class="card-body">' +
      '<h2 class="card-title">' + esc(v.title) + '</h2>' +
      (chName ? '<div class="card-channel">' + chName + '</div>' : '') +
      '<div class="card-meta">' +
        '<span>' + esc(relDate(v.date)) + '</span>' +
        '<span>' + esc(fmtDuration(v.durationSeconds)) + '</span>' +
        '<span>' + fmtNum(v.viewCount) + ' views</span>' +
        '<span>' + fmtNum(v.likes) + ' likes</span>' +
      '</div>' +
      '<div class="card-meta" style="margin-top:6px">' +
        badges +
        '<span class="card-topic" style="background:' + topicColor + '22;color:' + topicColor + '">' + esc(v.topic || '') + '</span>' +
      '</div>' +
    '</div>' +
  '</article>';
}

/* ── Topics ── */
function buildTopics() {
  var tc = {};
  allVideos.forEach(function(v) {
    if (v.topic) tc[v.topic] = (tc[v.topic] || 0) + 1;
  });

  // Build topics lookup with colors
  var topicColors = {
    'openclaw': '#06b6d4', 'open claw': '#06b6d4',
    'tutorial': '#22c55e', 'review': '#f59e0b',
    'news': '#ef4444', 'demo': '#8b5cf6'
  };
  Object.keys(tc).forEach(function(t) {
    topics[t] = { label: t, color: topicColors[t] || '#888', count: tc[t] };
  });

  var html = '<button class="cat-btn' + (!filterTopic ? ' active' : '') + '" data-topic="">' +
    '<span>All</span><span class="cat-count">' + allVideos.length + '</span></button>';

  Object.keys(tc).forEach(function(t) {
    var active = filterTopic === t;
    var color = topicColors[t] || '#888';
    html += '<button class="cat-btn' + (active ? ' active' : '') + '" data-topic="' + esc(t) + '">' +
      '<span><span class="cat-dot" style="background:' + color + '"></span>' + esc(t) + '</span>' +
      '<span class="cat-count">' + tc[t] + '</span></button>';
  });

  $topics.innerHTML = html;
  $topics.querySelectorAll('.cat-btn').forEach(function(b) {
    b.addEventListener('click', function() {
      filterTopic = b.dataset.topic || null;
      filterChannel = null;
      render(); buildTopics(); buildChannels();
    });
  });
}

/* ── Channels ── */
function buildChannels() {
  var cc = {};
  allVideos.forEach(function(v) {
    if (v.channelId) cc[v.channelId] = (cc[v.channelId] || 0) + 1;
  });

  var sorted = Object.entries(cc).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 12);
  if (!sorted.length) { $channels.innerHTML = ''; return; }

  var html = '';
  sorted.forEach(function(pair) {
    var cid = pair[0], cnt = pair[1];
    var ch = channels[cid];
    var name = ch ? ch.name : cid;
    var active = filterChannel === cid;
    html += '<button class="channel-btn' + (active ? ' active' : '') + '" data-channel="' + esc(cid) + '">' +
      '<span>' + esc(name) + '</span><span class="cat-count">' + cnt + '</span></button>';
  });

  $channels.innerHTML = html;
  $channels.querySelectorAll('.channel-btn').forEach(function(b) {
    b.addEventListener('click', function() {
      filterChannel = filterChannel === b.dataset.channel ? null : b.dataset.channel;
      filterTopic = null;
      render(); buildTopics(); buildChannels();
    });
  });
}

/* ── Filters bar ── */
function updateFilters() {
  var parts = [];
  if (filterTopic) parts.push('<span class="filter-chip">' + esc(filterTopic) + ' <span class="filter-x" data-action="clear-topic">&times;</span></span>');
  if (filterChannel) {
    var ch = channels[filterChannel];
    var name = ch ? ch.name : filterChannel;
    parts.push('<span class="filter-chip">' + esc(name) + ' <span class="filter-x" data-action="clear-channel">&times;</span></span>');
  }
  if (query) parts.push('<span class="filter-chip">&ldquo;' + esc(query) + '&rdquo; <span class="filter-x" data-action="clear-search">&times;</span></span>');

  if (!parts.length) { $filters.hidden = true; return; }
  $filters.hidden = false;
  $filters.innerHTML = '<span>Filtering:</span> ' + parts.join(' ');
  $filters.querySelectorAll('.filter-x').forEach(function(x) {
    x.addEventListener('click', function() {
      var a = x.dataset.action;
      if (a === 'clear-topic') { filterTopic = null; }
      else if (a === 'clear-channel') { filterChannel = null; }
      else if (a === 'clear-search') { query = ''; $search.value = ''; }
      render(); buildTopics(); buildChannels();
    });
  });
}

/* ── Drawer ── */
function openEntry(id) {
  // First render with what we have, then fetch full data
  var v = allVideos.find(function(x) { return x.id === id; });
  if (!v) return;

  renderDrawer(v, channels[v.channelId] || null, true);
  $drawer.hidden = false;
  document.body.classList.add('drawer-open');
  $dPanel.scrollTop = 0;
  if ($dScrollTop) $dScrollTop.classList.remove('visible');
  if (location.hash !== '#video/' + id) history.pushState(null, '', '#video/' + id);
  $dClose.focus();

  // Fetch full video data (with transcript)
  fetch(API + '/videos/' + encodeURIComponent(id))
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(data) {
      if (!data || !data.video) return;
      // Merge transcript into local cache
      var idx = allVideos.findIndex(function(x) { return x.id === id; });
      if (idx >= 0) {
        allVideos[idx] = Object.assign({}, allVideos[idx], { transcript: data.video.transcript, summary: data.video.summary, summaryModel: data.video.summaryModel });
      }
      if (!$drawer.hidden) {
        renderDrawer(data.video, data.channel, false);
      }
    });
}

function renderDrawer(v, ch, loading) {
  var chName = ch ? ch.name : '';
  var chUrl = ch ? ch.url : '';

  $dHead.innerHTML =
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
      '<a href="' + esc(v.url) + '" target="_blank" rel="noopener" class="drawer-btn primary">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="10,8 10,16 16,12"/></svg>' +
        'Watch on YouTube</a>' +
      '<button class="drawer-btn" id="btn-copy" ' + (!v.transcript && loading ? 'disabled' : '') + '>' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
        'Copy Transcript</button>' +
      '<button class="drawer-btn" id="btn-download" ' + (!v.hasTranscript ? 'disabled' : '') + '>' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        'Download .txt</button>' +
      '<button class="drawer-btn" id="btn-summarize" ' + (!v.hasTranscript ? 'disabled' : '') + '>' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>' +
        (v.summary ? 'Re-summarize' : 'Summarize with AI') + '</button>' +
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

  $dBody.innerHTML = thumbHtml + actions + stats + transcriptHtml + summaryHtml;

  // Wire action buttons
  var btnCopy = $dBody.querySelector('#btn-copy');
  var btnDl = $dBody.querySelector('#btn-download');
  var btnSum = $dBody.querySelector('#btn-summarize');

  if (btnCopy) {
    btnCopy.addEventListener('click', function() {
      var text = v.transcript || '';
      if (!text) { showToast('No transcript to copy'); return; }
      navigator.clipboard.writeText(text).then(function() {
        showToast('Transcript copied to clipboard!');
      }).catch(function() {
        // Fallback
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Transcript copied!');
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
      fetch(API + '/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: v.id })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error);
        // Update local cache
        var idx = allVideos.findIndex(function(x) { return x.id === v.id; });
        if (idx >= 0) {
          allVideos[idx].summary = data.summary;
          allVideos[idx].summaryModel = data.model;
        }
        v.summary = data.summary;
        v.summaryModel = data.model;
        var slot = document.getElementById('summary-slot');
        if (slot) {
          slot.innerHTML = '<div class="summary-section"><div class="transcript-header">AI Summary' + (data.cached ? ' (cached)' : '') + '</div><div class="summary-text">' + esc(data.summary).replace(/\n/g, '<br>') + '</div>' +
            (data.model ? '<div class="summary-model">Generated by ' + esc(data.model) + '</div>' : '') + '</div>';
        }
        btnSum.disabled = false;
        btnSum.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Re-summarize';
        render(); // Update card badges
      })
      .catch(function(err) {
        btnSum.disabled = false;
        btnSum.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Summarize with AI';
        showToast('Failed: ' + (err.message || 'Unknown error'));
      });
    });
  }
}

function closeDrawer() {
  $drawer.hidden = true;
  document.body.classList.remove('drawer-open');
  if (location.hash.startsWith('#video/')) history.pushState(null, '', location.pathname);
}

/* ── Toast ── */
function showToast(msg) {
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();
  var el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 2500);
}

/* ── Hash nav ── */
function handleHash() {
  var h = location.hash;
  if (h.startsWith('#video/')) {
    openEntry(decodeURIComponent(h.slice(7)));
  } else if (!$drawer.hidden) {
    $drawer.hidden = true;
    document.body.classList.remove('drawer-open');
  }
}

/* ── Events ── */
function wireEvents() {
  $dClose.addEventListener('click', closeDrawer);
  $dBack.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !$drawer.hidden) closeDrawer();
  });

  var timer;
  $search.addEventListener('input', function() {
    clearTimeout(timer);
    timer = setTimeout(function() {
      query = $search.value.trim();
      filterTopic = null; filterChannel = null;
      render(); buildTopics(); buildChannels();
    }, 200);
  });

  $sortSel.addEventListener('change', function() {
    sortBy = $sortSel.value;
    render();
  });

  // Export dropdown
  $exportBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    var open = !$exportMenu.hidden;
    $exportMenu.hidden = open;
    $exportBtn.setAttribute('aria-expanded', !open);
  });
  document.addEventListener('click', function() {
    $exportMenu.hidden = true;
    $exportBtn.setAttribute('aria-expanded', 'false');
  });
  $exportMenu.querySelectorAll('button').forEach(function(b) {
    b.addEventListener('click', function() {
      var fmt = b.dataset.format;
      window.open(API + '/export?format=' + fmt, '_blank');
      $exportMenu.hidden = true;
    });
  });

  // Drawer scroll-to-top
  if ($dPanel && $dScrollTop) {
    $dPanel.addEventListener('scroll', function() {
      if ($dPanel.scrollTop > 300) $dScrollTop.classList.add('visible');
      else $dScrollTop.classList.remove('visible');
    });
    $dScrollTop.addEventListener('click', function() {
      $dPanel.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}
