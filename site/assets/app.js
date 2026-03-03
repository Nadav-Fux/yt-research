/* YT Research — app.js */
'use strict';

let allVideos = [];
let channels = {};
let topics = {};
let filterTopic = null;
let filterChannel = null;
let query = '';
let sortBy = 'date';
let transcriptCache = {};

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
var $scrapeTopic = $('scrape-topic');
var $scrapeBtn   = $('scrape-btn');
var $scrapeStatus = $('scrape-status');

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
    el.addEventListener('click', function(ev) {
      if (ev.target.closest('.card-transcript-toggle') || ev.target.closest('.card-transcript-container')) return;
      openEntry(el.dataset.id);
    });
    el.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEntry(el.dataset.id); }
    });
  });

  $cards.querySelectorAll('.card-transcript-toggle').forEach(function(btn) {
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      toggleCardTranscript(btn.dataset.vid);
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
      (v.hasTranscript
        ? '<button class="card-transcript-toggle" data-vid="' + esc(v.id) + '" type="button"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 6h16M4 12h16M4 18h10"/></svg> Transcript <span class="toggle-arrow">&#9660;</span></button>'
        : '<span class="card-transcript-disabled"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 6h16M4 12h16M4 18h10"/></svg> No transcript</span>') +
      '<div class="card-transcript-container" id="ct-' + esc(v.id) + '" hidden></div>' +
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


/* ── Card inline transcript ── */
function toggleCardTranscript(vid) {
  var container = document.getElementById('ct-' + vid);
  if (!container) return;
  var btn = container.parentElement.querySelector('.card-transcript-toggle');

  // If already visible, collapse
  if (!container.hidden) {
    container.hidden = true;
    if (btn) {
      btn.classList.remove('active');
      btn.querySelector('.toggle-arrow').innerHTML = '&#9660;';
    }
    return;
  }

  // Show container
  container.hidden = false;
  if (btn) {
    btn.classList.add('active');
    btn.querySelector('.toggle-arrow').innerHTML = '&#9650;';
  }

  // If already loaded, done
  if (transcriptCache[vid]) {
    return;
  }

  // Show loading state
  container.innerHTML = '<div class="ct-loading"><span class="spinner"></span> Loading transcript...</div>';

  fetch(API + '/videos/' + encodeURIComponent(vid))
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(data) {
      if (!data || !data.video || !data.video.transcript) {
        container.innerHTML = '<div class="ct-empty">Transcript not available.</div>';
        return;
      }
      transcriptCache[vid] = data.video.transcript;
      // Also update local cache
      var idx = allVideos.findIndex(function(x) { return x.id === vid; });
      if (idx >= 0) {
        allVideos[idx].transcript = data.video.transcript;
        if (data.video.summary) allVideos[idx].summary = data.video.summary;
      }
      renderCardTranscript(vid, container);
    })
    .catch(function() {
      container.innerHTML = '<div class="ct-empty">Failed to load transcript.</div>';
    });
}

function renderCardTranscript(vid, container) {
  var text = transcriptCache[vid] || '';
  container.innerHTML =
    '<div class="ct-actions">' +
      '<button class="ct-copy-btn" type="button"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy</button>' +
      '<button class="ct-collapse-btn" type="button"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg> Collapse</button>' +
    '</div>' +
    '<div class="ct-text">' + esc(text) + '</div>';

  container.querySelector('.ct-copy-btn').addEventListener('click', function(ev) {
    ev.stopPropagation();
    navigator.clipboard.writeText(text).then(function() {
      showToast('Transcript copied!');
    }).catch(function() {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Transcript copied!');
    });
  });

  container.querySelector('.ct-collapse-btn').addEventListener('click', function(ev) {
    ev.stopPropagation();
    toggleCardTranscript(vid);
  });
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

  // Scrape button
  if ($scrapeBtn && $scrapeTopic) {
    $scrapeBtn.addEventListener('click', startScrape);
    $scrapeTopic.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') startScrape();
    });
  }

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

/* ── Scrape ── */
function startScrape() {
  var topic = $scrapeTopic.value.trim();
  if (!topic) { $scrapeTopic.focus(); return; }

  $scrapeBtn.disabled = true;
  $scrapeStatus.hidden = false;
  $scrapeStatus.className = 'scrape-status loading';
  $scrapeStatus.innerHTML = '<span class="spinner"></span> Scraping YouTube for "' + esc(topic) + '"... This takes 2-4 minutes.';

  fetch(API + '/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: topic })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.error) throw new Error(data.error);
    $scrapeStatus.className = 'scrape-status success';
    $scrapeStatus.innerHTML = 'Scrape started for "' + esc(topic) + '". New videos will appear in a few minutes. <button class="scrape-refresh-btn" type="button">Refresh now</button>';
    $scrapeBtn.disabled = false;

    // Auto-refresh after 3 minutes
    var refreshTimer = setTimeout(function() { refreshData(); }, 180000);

    // Manual refresh button
    var refreshBtn = $scrapeStatus.querySelector('.scrape-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        clearTimeout(refreshTimer);
        refreshData();
      });
    }
  })
  .catch(function(err) {
    $scrapeStatus.className = 'scrape-status error';
    $scrapeStatus.textContent = 'Failed: ' + (err.message || 'Unknown error');
    $scrapeBtn.disabled = false;
  });
}

function refreshData() {
  $scrapeStatus.className = 'scrape-status loading';
  $scrapeStatus.innerHTML = '<span class="spinner"></span> Refreshing...';

  fetch(API + '/videos')
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var oldCount = allVideos.length;
      allVideos = data.videos || [];
      channels = data.channels || {};
      var newCount = allVideos.length;
      var diff = newCount - oldCount;

      buildTopics();
      buildChannels();
      render();

      if (diff > 0) {
        $scrapeStatus.className = 'scrape-status success';
        $scrapeStatus.textContent = diff + ' new video' + (diff > 1 ? 's' : '') + ' added! Total: ' + newCount;
        showToast(diff + ' new videos added!');
      } else {
        $scrapeStatus.className = 'scrape-status loading';
        $scrapeStatus.innerHTML = 'No new videos yet. Scrape may still be running. <button class="scrape-refresh-btn" type="button">Try again</button>';
        var btn = $scrapeStatus.querySelector('.scrape-refresh-btn');
        if (btn) btn.addEventListener('click', refreshData);
      }
    })
    .catch(function() {
      $scrapeStatus.className = 'scrape-status error';
      $scrapeStatus.textContent = 'Failed to refresh data';
    });
}

/* ── Reader View ── */
(function() {
  var currentView = 'cards';
  var readerLoaded = false;
  var readerTranscripts = {}; // id -> { video, transcript }
  var readerSearchTerm = '';

  /* DOM refs for reader */
  var $viewToggle = document.getElementById('view-toggle');
  var $readerView = document.getElementById('reader-view');
  var $readerProgress = document.getElementById('reader-progress');
  var $readerProgressBar = document.getElementById('reader-progress-bar');
  var $readerProgressText = document.getElementById('reader-progress-text');
  var $readerSearchBar = document.getElementById('reader-search-bar');
  var $readerSearch = document.getElementById('reader-search');
  var $readerSearchCount = document.getElementById('reader-search-count');
  var $readerToc = document.getElementById('reader-toc');
  var $readerContent = document.getElementById('reader-content');

  /* Elements that need to be hidden/shown when switching views */
  function getCardsViewEls() {
    return {
      cards: document.getElementById('cards'),
      empty: document.getElementById('empty'),
      sortBar: document.getElementById('sort-bar'),
      filters: document.getElementById('filters')
    };
  }

  /* ── View Toggle ── */
  if ($viewToggle) {
    $viewToggle.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var view = btn.dataset.view;
        if (view === currentView) return;
        currentView = view;

        $viewToggle.querySelectorAll('.view-toggle-btn').forEach(function(b) {
          b.classList.toggle('active', b.dataset.view === view);
        });

        if (view === 'reader') {
          showReaderView();
        } else {
          showCardsView();
        }
      });
    });
  }

  function showCardsView() {
    var els = getCardsViewEls();
    if (els.cards) els.cards.style.display = '';
    if (els.sortBar) els.sortBar.style.display = '';
    if ($readerView) $readerView.hidden = true;
  }

  function showReaderView() {
    var els = getCardsViewEls();
    if (els.cards) els.cards.style.display = 'none';
    if (els.empty) els.empty.hidden = true;
    if (els.sortBar) els.sortBar.style.display = 'none';
    if (els.filters) els.filters.hidden = true;
    if ($readerView) $readerView.hidden = false;

    if (!readerLoaded) {
      loadAllTranscripts();
    }
  }

  /* ── Load all transcripts ── */
  function loadAllTranscripts() {
    /* allVideos is globally available from the main app */
    if (typeof allVideos === 'undefined' || !allVideos.length) {
      if ($readerContent) $readerContent.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:40px">No videos loaded yet. Please wait for data to load.</p>';
      return;
    }

    var videosWithTranscript = allVideos.filter(function(v) { return v.hasTranscript; });
    var total = videosWithTranscript.length;

    if (total === 0) {
      if ($readerContent) $readerContent.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:40px">No videos with transcripts found.</p>';
      readerLoaded = true;
      return;
    }

    $readerProgress.hidden = false;
    $readerSearchBar.hidden = true;
    $readerProgressText.textContent = 'Loading 0/' + total + ' transcripts...';
    $readerProgressBar.style.setProperty('--progress', '0%');

    var loaded = 0;
    var results = [];

    /* Batch fetch with concurrency limit */
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
        var v = queue.shift();
        fetchOne(v);
      }
    }

    function fetchOne(v) {
      fetch(API + '/videos/' + encodeURIComponent(v.id))
        .then(function(res) { return res.ok ? res.json() : null; })
        .then(function(data) {
          if (data && data.video) {
            results.push({
              video: Object.assign({}, v, { transcript: data.video.transcript, summary: data.video.summary }),
              channel: data.channel
            });
            readerTranscripts[v.id] = results[results.length - 1];
          }
        })
        .catch(function() { /* skip failed */ })
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
  }

  function onAllLoaded(results) {
    readerLoaded = true;
    $readerProgress.hidden = true;
    $readerSearchBar.hidden = false;

    /* Sort by date descending */
    results.sort(function(a, b) {
      return new Date(b.video.date) - new Date(a.video.date);
    });

    renderReaderToc(results);
    renderReaderContent(results);
    wireReaderSearch(results);
  }

  /* ── Render TOC ── */
  function renderReaderToc(results) {
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

    /* TOC click handler */
    $readerToc.querySelectorAll('.reader-toc-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id;
        var section = document.getElementById('reader-section-' + id);
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        $readerToc.querySelectorAll('.reader-toc-item').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    /* Scroll spy: highlight TOC item on scroll */
    setupScrollSpy(results);
  }

  function setupScrollSpy(results) {
    var sections = results.map(function(r) {
      return document.getElementById('reader-section-' + r.video.id);
    }).filter(Boolean);

    var tocButtons = $readerToc.querySelectorAll('.reader-toc-item');
    var headerOffset = 80;
    var scrollContainer = $readerContent;

    function onScroll() {
      var scrollTop = window.scrollY || document.documentElement.scrollTop;
      var current = 0;
      for (var i = 0; i < sections.length; i++) {
        var rect = sections[i].getBoundingClientRect();
        if (rect.top <= headerOffset + 20) {
          current = i;
        }
      }
      tocButtons.forEach(function(b, idx) {
        b.classList.toggle('active', idx === current);
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Render Content ── */
  function renderReaderContent(results) {
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
  }

  /* ── Search in transcripts ── */
  function wireReaderSearch(results) {
    var timer;
    $readerSearch.addEventListener('input', function() {
      clearTimeout(timer);
      timer = setTimeout(function() {
        readerSearchTerm = $readerSearch.value.trim();
        applyReaderSearch(results);
      }, 250);
    });
  }

  function applyReaderSearch(results) {
    var transcriptEls = $readerContent.querySelectorAll('.reader-section-transcript');

    if (!readerSearchTerm) {
      /* Clear highlights */
      transcriptEls.forEach(function(el) {
        var vid = el.dataset.videoId;
        var r = readerTranscripts[vid];
        if (r && r.video.transcript) {
          el.innerHTML = esc(r.video.transcript);
        }
      });
      $readerSearchCount.textContent = '';
      return;
    }

    var totalMatches = 0;
    var searchLower = readerSearchTerm.toLowerCase();
    var escapedSearch = readerSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('(' + escapedSearch + ')', 'gi');

    transcriptEls.forEach(function(el) {
      var vid = el.dataset.videoId;
      var r = readerTranscripts[vid];
      if (!r || !r.video.transcript) return;

      var text = r.video.transcript;
      var matches = text.match(regex);
      if (matches) {
        totalMatches += matches.length;
        el.innerHTML = esc(text).replace(
          new RegExp('(' + escapedSearch.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + ')', 'gi'),
          '<mark class="reader-highlight">$1</mark>'
        );
      } else {
        el.innerHTML = esc(text);
      }
    });

    $readerSearchCount.textContent = totalMatches + ' match' + (totalMatches !== 1 ? 'es' : '') + ' found';

    /* Scroll to first match */
    if (totalMatches > 0) {
      var first = $readerContent.querySelector('.reader-highlight');
      if (first) {
        first.classList.add('reader-highlight-current');
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  /* ── Expose for external access if needed ── */
  window.readerView = {
    show: showReaderView,
    hide: showCardsView,
    reload: function() { readerLoaded = false; loadAllTranscripts(); }
  };
})();
