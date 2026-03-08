
/* ── AI Extract System (v2 — accessible, polished UX) ── */
(function() {
  'use strict';

  var N8N_WEBHOOK = 'https://n8n.74111147.xyz/webhook/yt-extract';
  var PROMPTS_API = 'https://yt-research-api.nadavf.workers.dev/api/prompts';
  var BUILTIN_DEFAULT_PROMPT = 'You are a research analyst. Extract the most valuable and actionable information from this YouTube video transcript. Focus on:\n- Key insights and unique perspectives\n- Specific techniques, tools, or methods mentioned\n- Important facts, numbers, and data points\n- Actionable advice and recommendations\nSkip filler, repetition, sponsor segments, and pleasantries. Be concise but thorough. Use bullet points.';

  var STAR_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/></svg>';
  var GEAR_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';

  /* ── State ── */
  var aiExtractCache = new Map();
  var promptsCache = null;
  var promptsCacheTime = 0;
  var PROMPTS_CACHE_TTL = 60000;

  /* ── Utility: focus-trap for modals ── */
  function trapFocus(container) {
    var FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    function getFocusable() {
      return Array.prototype.slice.call(container.querySelectorAll(FOCUSABLE)).filter(function(el) {
        return el.offsetParent !== null; /* visible */
      });
    }
    function handler(e) {
      if (e.key !== 'Tab') return;
      var els = getFocusable();
      if (!els.length) return;
      var first = els[0];
      var last = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    container.addEventListener('keydown', handler);
    return function release() { container.removeEventListener('keydown', handler); };
  }

  /* ── Utility: announce to screen readers ── */
  function announce(msg) {
    var el = document.getElementById('ai-sr-announce');
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
  }

  /* ── Fetch prompts with caching ── */
  function fetchPrompts(force) {
    if (!force && promptsCache && (Date.now() - promptsCacheTime < PROMPTS_CACHE_TTL)) {
      return Promise.resolve(promptsCache);
    }
    return fetch(PROMPTS_API)
      .then(function(r) { return r.ok ? r.json() : { prompts: [], defaultPromptId: null }; })
      .then(function(data) {
        promptsCache = data;
        promptsCacheTime = Date.now();
        return data;
      })
      .catch(function() { return { prompts: [], defaultPromptId: null }; });
  }

  function getEffectivePrompt(data, selectedId) {
    if (!selectedId || selectedId === '__builtin__') return BUILTIN_DEFAULT_PROMPT;
    var p = (data.prompts || []).find(function(x) { return x.id === selectedId; });
    return p ? p.text : BUILTIN_DEFAULT_PROMPT;
  }

  function getDefaultPromptId(data) {
    return data.defaultPromptId || '__builtin__';
  }

  /* ── Call n8n extraction ── */
  function callExtract(transcript, prompt, videoId, videoTitle) {
    return fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: transcript, prompt: prompt, videoId: videoId, videoTitle: videoTitle })
    })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* ── Render markdown-ish AI text to safe HTML ── */
  function renderAIText(text) {
    if (!text) return '';
    var s = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
  }

  /* ════════════════════════════════════════════════
     Prompt Dropdown (keyboard-navigable menu)
     ════════════════════════════════════════════════ */
  function createPromptDropdown(promptsData, triggerEl, onSelect) {
    /* Remove any existing dropdown */
    var old = document.querySelector('.ai-prompt-dropdown');
    if (old) old.remove();

    var dropdown = document.createElement('div');
    dropdown.className = 'ai-prompt-dropdown';
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('aria-label', 'Select extraction prompt');

    var defaultId = getDefaultPromptId(promptsData);
    var prompts = promptsData.prompts || [];

    var html = '<div class="ai-prompt-dropdown-title" id="ai-dd-label">Select prompt:</div>';
    html += '<button class="ai-prompt-option' + (defaultId === '__builtin__' ? ' selected' : '') + '" role="menuitem" tabindex="0" data-id="__builtin__">Default (built-in)</button>';
    prompts.forEach(function(p) {
      html += '<button class="ai-prompt-option' + (defaultId === p.id ? ' selected' : '') + '" role="menuitem" tabindex="-1" data-id="' + p.id + '">' + esc(p.name) + '</button>';
    });
    dropdown.innerHTML = html;

    var items = dropdown.querySelectorAll('[role="menuitem"]');

    /* Click handler */
    items.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeDropdown(btn.dataset.id);
      });
    });

    /* Keyboard: arrow up/down, Enter, Escape */
    dropdown.addEventListener('keydown', function(e) {
      var focused = document.activeElement;
      var idx = Array.prototype.indexOf.call(items, focused);
      if (e.key === 'ArrowDown' || e.key === 'Down') {
        e.preventDefault();
        var next = (idx + 1) % items.length;
        items[next].focus();
      } else if (e.key === 'ArrowUp' || e.key === 'Up') {
        e.preventDefault();
        var prev = (idx - 1 + items.length) % items.length;
        items[prev].focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (focused && focused.dataset && focused.dataset.id) {
          closeDropdown(focused.dataset.id);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown(null);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        closeDropdown(null);
      }
    });

    function closeDropdown(selectedId) {
      dropdown.classList.add('ai-prompt-dropdown-closing');
      setTimeout(function() {
        dropdown.remove();
        document.removeEventListener('mousedown', outsideHandler, true);
        if (triggerEl) triggerEl.focus();
      }, 120);
      if (selectedId) onSelect(selectedId);
    }

    /* Close on outside click */
    function outsideHandler(e) {
      if (!dropdown.contains(e.target) && e.target !== triggerEl) {
        closeDropdown(null);
      }
    }
    setTimeout(function() {
      document.addEventListener('mousedown', outsideHandler, true);
    }, 10);

    /* Focus first item after a tick */
    setTimeout(function() {
      var sel = dropdown.querySelector('.ai-prompt-option.selected') || items[0];
      if (sel) sel.focus();
    }, 30);

    return dropdown;
  }

  /* ════════════════════════════════════════════════
     Extract buttons on each reader section
     ════════════════════════════════════════════════ */
  function injectExtractButtons() {
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
      if (copyBtn) {
        header.insertBefore(extractBtn, copyBtn);
      } else {
        header.appendChild(extractBtn);
      }

      extractBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        handleExtractClick(sectionId, section, extractBtn);
      });
      extractBtn.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleExtractClick(sectionId, section, extractBtn);
        }
      });
    });
  }

  /* ── Handle per-section extract click ── */
  function handleExtractClick(videoId, section, btn) {
    if (aiExtractCache.has(videoId)) {
      ensureTabs(videoId, section);
      switchTab(videoId, section, 'ai');
      return;
    }

    var existingDd = btn.parentElement.querySelector('.ai-prompt-dropdown');
    if (existingDd) { existingDd.remove(); return; }

    fetchPrompts().then(function(data) {
      var prompts = data.prompts || [];
      if (prompts.length === 0) {
        doExtract(videoId, section, btn, BUILTIN_DEFAULT_PROMPT);
      } else {
        var dd = createPromptDropdown(data, btn, function(selectedId) {
          var promptText = getEffectivePrompt(data, selectedId);
          doExtract(videoId, section, btn, promptText);
        });
        btn.parentElement.style.position = 'relative';
        btn.parentElement.appendChild(dd);
        var rect = btn.getBoundingClientRect();
        var parentRect = btn.parentElement.getBoundingClientRect();
        dd.style.top = (rect.bottom - parentRect.top + 4) + 'px';
        dd.style.right = '0';
      }
    });
  }

  /* ── Execute extraction for one section ── */
  function doExtract(videoId, section, btn, promptText) {
    var transcriptEl = section.querySelector('.reader-section-transcript');
    if (!transcriptEl) { showToast('No transcript available'); return; }
    var transcript = transcriptEl.textContent;
    if (!transcript || transcript.trim().length < 50) { showToast('Transcript too short'); return; }

    var titleEl = section.querySelector('.reader-section-title a');
    var videoTitle = titleEl ? titleEl.textContent : '';

    /* Loading state */
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="spinner"></span> Extracting...';
    section.classList.add('ai-extracting');
    announce('Extracting transcript for ' + videoTitle);

    callExtract(transcript, promptText, videoId, videoTitle)
      .then(function(data) {
        var result = data.result || data.output || 'No result returned';
        aiExtractCache.set(videoId, { text: result, model: data.model || 'AI' });
        ensureTabs(videoId, section);
        switchTab(videoId, section, 'ai');
        resetExtractBtn(btn);
        section.classList.remove('ai-extracting');
        announce('Extraction complete for ' + videoTitle);
        showToast('Extraction complete!');
      })
      .catch(function(err) {
        showToast('Extraction failed: ' + err.message);
        resetExtractBtn(btn);
        section.classList.remove('ai-extracting');
        announce('Extraction failed');
      });
  }

  function resetExtractBtn(btn) {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.innerHTML = STAR_ICON + ' Extract';
  }

  /* ════════════════════════════════════════════════
     Tabs: Original / AI Extract (per-section)
     ════════════════════════════════════════════════ */
  function ensureTabs(videoId, section) {
    if (section.querySelector('.ai-tabs')) return;

    var transcriptEl = section.querySelector('.reader-section-transcript');
    if (!transcriptEl) return;

    var tablistId = 'ai-tablist-' + videoId;
    var panelOrigId = 'ai-panel-orig-' + videoId;
    var panelAiId = 'ai-panel-ai-' + videoId;
    var tabOrigId = 'ai-tab-orig-' + videoId;
    var tabAiId = 'ai-tab-ai-' + videoId;

    /* Tab bar */
    var tabs = document.createElement('div');
    tabs.className = 'ai-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Transcript view');
    tabs.id = tablistId;
    tabs.innerHTML =
      '<button class="ai-tab active" role="tab" id="' + tabOrigId + '" aria-selected="true" aria-controls="' + panelOrigId + '" tabindex="0" data-tab="original" data-vid="' + videoId + '">Original</button>' +
      '<button class="ai-tab" role="tab" id="' + tabAiId + '" aria-selected="false" aria-controls="' + panelAiId + '" tabindex="-1" data-tab="ai" data-vid="' + videoId + '">AI Extract</button>';

    transcriptEl.parentNode.insertBefore(tabs, transcriptEl);

    /* Mark original transcript as a tabpanel */
    transcriptEl.setAttribute('role', 'tabpanel');
    transcriptEl.setAttribute('aria-labelledby', tabOrigId);
    transcriptEl.id = panelOrigId;
    transcriptEl.setAttribute('tabindex', '0');

    /* AI content tabpanel */
    var aiDiv = document.createElement('div');
    aiDiv.className = 'ai-extract-content';
    aiDiv.id = panelAiId;
    aiDiv.setAttribute('role', 'tabpanel');
    aiDiv.setAttribute('aria-labelledby', tabAiId);
    aiDiv.setAttribute('tabindex', '0');
    aiDiv.hidden = true;
    transcriptEl.parentNode.insertBefore(aiDiv, transcriptEl.nextSibling);

    /* Click handlers */
    var tabButtons = tabs.querySelectorAll('[role="tab"]');
    tabButtons.forEach(function(tab) {
      tab.addEventListener('click', function() {
        switchTab(videoId, section, tab.dataset.tab);
      });
    });

    /* Keyboard: left/right arrows between tabs */
    tabs.addEventListener('keydown', function(e) {
      var tabArr = Array.prototype.slice.call(tabButtons);
      var idx = tabArr.indexOf(document.activeElement);
      if (idx < 0) return;
      if (e.key === 'ArrowRight' || e.key === 'Right') {
        e.preventDefault();
        var next = tabArr[(idx + 1) % tabArr.length];
        next.focus();
        switchTab(videoId, section, next.dataset.tab);
      } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        e.preventDefault();
        var prev = tabArr[(idx - 1 + tabArr.length) % tabArr.length];
        prev.focus();
        switchTab(videoId, section, prev.dataset.tab);
      } else if (e.key === 'Home') {
        e.preventDefault();
        tabArr[0].focus();
        switchTab(videoId, section, tabArr[0].dataset.tab);
      } else if (e.key === 'End') {
        e.preventDefault();
        tabArr[tabArr.length - 1].focus();
        switchTab(videoId, section, tabArr[tabArr.length - 1].dataset.tab);
      }
    });
  }

  function switchTab(videoId, section, tabName) {
    var tabButtons = section.querySelectorAll('[role="tab"]');
    tabButtons.forEach(function(t) {
      var isActive = t.dataset.tab === tabName;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      t.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    var transcriptEl = section.querySelector('.reader-section-transcript');
    var aiDiv = section.querySelector('.ai-extract-content');
    if (!transcriptEl || !aiDiv) return;

    if (tabName === 'ai') {
      transcriptEl.hidden = true;
      aiDiv.hidden = false;
      var cached = aiExtractCache.get(videoId);
      if (cached) {
        aiDiv.innerHTML = '<div class="ai-extract-text">' + renderAIText(cached.text) + '</div>' +
          '<div class="ai-extract-model">Generated by ' + esc(cached.model) + '</div>';
      }
    } else {
      transcriptEl.hidden = false;
      aiDiv.hidden = true;
    }
  }

  /* ════════════════════════════════════════════════
     Floating Action Bar — wire Extract Best
     ════════════════════════════════════════════════ */
  function wireFloatingExtract() {
    var rabExtract = document.getElementById('rab-extract');
    if (!rabExtract || rabExtract.dataset.wiredAi) return;
    rabExtract.dataset.wiredAi = '1';

    var newBtn = rabExtract.cloneNode(true);
    newBtn.setAttribute('aria-label', 'Extract Best from selected videos');
    rabExtract.parentNode.replaceChild(newBtn, rabExtract);

    newBtn.addEventListener('click', function() {
      var checkboxes = document.querySelectorAll('.reader-section-checkbox:checked');
      if (checkboxes.length === 0) { showToast('No videos selected'); return; }

      var videoIds = [];
      checkboxes.forEach(function(cb) { videoIds.push(cb.dataset.videoId); });

      var existing = document.querySelector('.ai-batch-dropdown');
      if (existing) { existing.remove(); return; }

      fetchPrompts().then(function(data) {
        var prompts = data.prompts || [];
        if (prompts.length === 0) {
          doBatchExtract(videoIds, BUILTIN_DEFAULT_PROMPT);
        } else {
          var dd = createPromptDropdown(data, newBtn, function(selectedId) {
            var promptText = getEffectivePrompt(data, selectedId);
            doBatchExtract(videoIds, promptText);
          });
          dd.classList.add('ai-batch-dropdown');
          var bar = document.getElementById('reader-action-bar');
          if (bar) {
            bar.style.position = 'relative';
            dd.style.bottom = '100%';
            dd.style.top = 'auto';
            dd.style.marginBottom = '8px';
            bar.appendChild(dd);
          }
        }
      });
    });
  }

  /* ── Batch extract ── */
  function doBatchExtract(videoIds, promptText) {
    var total = videoIds.length;
    var current = 0;
    var succeeded = 0;
    var rabExtract = document.getElementById('rab-extract');
    if (rabExtract) {
      rabExtract.disabled = true;
      rabExtract.setAttribute('aria-busy', 'true');
    }
    announce('Starting batch extraction of ' + total + ' videos');

    function next() {
      if (current >= total) {
        if (rabExtract) {
          rabExtract.disabled = false;
          rabExtract.removeAttribute('aria-busy');
          rabExtract.innerHTML = STAR_ICON + ' Extract Best';
        }
        showToast('Extracted ' + succeeded + '/' + total + ' video(s)');
        announce('Batch extraction complete. ' + succeeded + ' of ' + total + ' succeeded.');
        return;
      }
      var videoId = videoIds[current];
      current++;
      if (rabExtract) rabExtract.innerHTML = '<span class="spinner"></span> Extracting ' + current + '/' + total + '...';

      if (aiExtractCache.has(videoId)) {
        var sec = document.getElementById('reader-section-' + videoId);
        if (sec) { ensureTabs(videoId, sec); switchTab(videoId, sec, 'ai'); }
        succeeded++;
        next();
        return;
      }

      var section = document.getElementById('reader-section-' + videoId);
      if (!section) { next(); return; }
      var transcriptEl = section.querySelector('.reader-section-transcript');
      if (!transcriptEl) { next(); return; }

      var transcript = transcriptEl.textContent;
      var titleEl = section.querySelector('.reader-section-title a');
      var videoTitle = titleEl ? titleEl.textContent : '';
      section.classList.add('ai-extracting');

      callExtract(transcript, promptText, videoId, videoTitle)
        .then(function(data) {
          var result = data.result || data.output || 'No result returned';
          aiExtractCache.set(videoId, { text: result, model: data.model || 'AI' });
          ensureTabs(videoId, section);
          switchTab(videoId, section, 'ai');
          section.classList.remove('ai-extracting');
          succeeded++;
        })
        .catch(function() { section.classList.remove('ai-extracting'); })
        .finally(next);
    }

    next();
  }

  /* ════════════════════════════════════════════════
     Prompt Manager Modal (accessible, focus-trapped)
     ════════════════════════════════════════════════ */
  var pmTriggerEl = null;
  var pmReleaseTrap = null;

  function openPromptManager(triggerElement) {
    pmTriggerEl = triggerElement || document.activeElement;

    var existing = document.getElementById('prompt-manager-modal');
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

    /* Focus trap */
    pmReleaseTrap = trapFocus(modal.querySelector('.pm-modal'));

    /* Focus the close button initially */
    var closeBtn = modal.querySelector('.pm-close');
    setTimeout(function() { closeBtn.focus(); }, 50);

    /* Close handlers */
    modal.querySelector('.pm-backdrop').addEventListener('click', closePromptManager);
    closeBtn.addEventListener('click', closePromptManager);

    function escHandler(e) {
      if (e.key === 'Escape') {
        var editor = modal.querySelector('.pm-editor');
        if (editor) {
          /* If editor is open, close editor first */
          editor.remove();
          return;
        }
        closePromptManager();
      }
    }
    document.addEventListener('keydown', escHandler);
    modal._escHandler = escHandler;

    /* Load prompts */
    fetchPrompts(true).then(renderPromptList);

    /* Add new prompt */
    modal.querySelector('#pm-add-btn').addEventListener('click', function() {
      showPromptEditor(null);
    });
  }

  function closePromptManager() {
    var modal = document.getElementById('prompt-manager-modal');
    if (!modal) return;

    /* Animate out */
    modal.classList.add('pm-overlay-closing');
    if (modal._escHandler) document.removeEventListener('keydown', modal._escHandler);
    if (pmReleaseTrap) { pmReleaseTrap(); pmReleaseTrap = null; }
    document.body.classList.remove('pm-open');

    setTimeout(function() {
      modal.remove();
      /* Return focus to trigger */
      if (pmTriggerEl && pmTriggerEl.focus) {
        try { pmTriggerEl.focus(); } catch(e) {}
      }
      pmTriggerEl = null;
    }, 150);
  }

  function renderPromptList(data) {
    var body = document.getElementById('pm-body');
    if (!body) return;

    var prompts = data.prompts || [];
    var defaultId = data.defaultPromptId || null;
    var html = '';

    /* Built-in default (not editable/deletable) */
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
            '<button class="pm-item-edit" data-id="' + p.id + '" aria-label="Edit prompt: ' + esc(p.name) + '" title="Edit">&#9998;</button>' +
            '<button class="pm-item-delete" data-id="' + p.id + '" aria-label="Delete prompt: ' + esc(p.name) + '" title="Delete">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div class="pm-item-preview">' + esc((p.text || '').substring(0, 150)) + (p.text && p.text.length > 150 ? '...' : '') + '</div>' +
      '</div>';
    });

    if (prompts.length === 0) {
      html += '<div class="pm-empty">No custom prompts yet. Add one below.</div>';
    }

    body.innerHTML = html;

    /* Wire star buttons */
    body.querySelectorAll('.pm-item-star[data-id]').forEach(function(star) {
      star.addEventListener('click', function() { setDefaultPrompt(star.dataset.id); });
    });

    /* Wire edit buttons */
    body.querySelectorAll('.pm-item-edit').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var p = (promptsCache.prompts || []).find(function(x) { return x.id === btn.dataset.id; });
        if (p) showPromptEditor(p);
      });
    });

    /* Wire delete buttons */
    body.querySelectorAll('.pm-item-delete').forEach(function(btn) {
      btn.addEventListener('click', function() { deletePrompt(btn.dataset.id); });
    });
  }

  function setDefaultPrompt(id) {
    fetch(PROMPTS_API + '/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true })
    })
    .then(function(r) { return r.json(); })
    .then(function() {
      showToast('Default prompt updated');
      fetchPrompts(true).then(renderPromptList);
    })
    .catch(function(err) { showToast('Failed to set default: ' + err.message); });
  }

  function deletePrompt(id) {
    if (!confirm('Delete this prompt?')) return;
    fetch(PROMPTS_API + '/' + id, { method: 'DELETE' })
      .then(function(r) {
        if (!r.ok) throw new Error('Delete failed');
        showToast('Prompt deleted');
        return fetchPrompts(true);
      })
      .then(renderPromptList)
      .catch(function(err) { showToast('Failed to delete: ' + err.message); });
  }

  function showPromptEditor(existingPrompt) {
    var body = document.getElementById('pm-body');
    if (!body) return;

    var isEdit = !!existingPrompt;
    var nameVal = isEdit ? existingPrompt.name : '';
    var textVal = isEdit ? existingPrompt.text : '';

    /* Remove existing editor */
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

    /* Save via Enter in name field */
    nameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        editor.querySelector('.pm-editor-text').focus();
      }
    });

    /* Ctrl+Enter in textarea to save */
    editor.querySelector('.pm-editor-text').addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        editor.querySelector('.pm-editor-save').click();
      }
    });

    editor.querySelector('.pm-editor-save').addEventListener('click', function() {
      var name = editor.querySelector('.pm-editor-name').value.trim();
      var text = editor.querySelector('.pm-editor-text').value.trim();
      if (!name || !text) {
        showToast('Name and text are required');
        if (!name) nameInput.focus();
        return;
      }

      var saveBtn = editor.querySelector('.pm-editor-save');
      saveBtn.disabled = true;
      saveBtn.setAttribute('aria-busy', 'true');
      saveBtn.textContent = 'Saving...';

      var url = isEdit ? PROMPTS_API + '/' + existingPrompt.id : PROMPTS_API;
      var method = isEdit ? 'PUT' : 'POST';

      fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, text: text })
      })
      .then(function(r) {
        if (!r.ok) throw new Error('Save failed');
        return fetchPrompts(true);
      })
      .then(function(data) {
        renderPromptList(data);
        showToast(isEdit ? 'Prompt updated!' : 'Prompt created!');
      })
      .catch(function(err) {
        showToast('Failed to save: ' + err.message);
        saveBtn.disabled = false;
        saveBtn.removeAttribute('aria-busy');
        saveBtn.textContent = isEdit ? 'Save Changes' : 'Create Prompt';
      });
    });
  }

  /* ════════════════════════════════════════════════
     Gear buttons: inject into floating bar + reader header
     ════════════════════════════════════════════════ */
  function injectPromptManagerButton() {
    var bar = document.getElementById('reader-action-bar');
    if (!bar || bar.querySelector('.ai-pm-btn')) return;

    var pmBtn = document.createElement('button');
    pmBtn.type = 'button';
    pmBtn.className = 'rab-btn ai-pm-btn';
    pmBtn.title = 'Manage Prompts';
    pmBtn.setAttribute('aria-label', 'Open Prompt Manager');
    pmBtn.innerHTML = GEAR_ICON;
    pmBtn.addEventListener('click', function() { openPromptManager(pmBtn); });

    var clearBtn = bar.querySelector('#rab-clear');
    if (clearBtn) {
      bar.insertBefore(pmBtn, clearBtn);
    } else {
      bar.appendChild(pmBtn);
    }
  }

  function injectReaderHeaderGear() {
    var searchBar = document.getElementById('reader-search-bar');
    if (!searchBar || searchBar.querySelector('.ai-pm-header-btn')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ai-pm-header-btn';
    btn.title = 'Manage Extraction Prompts';
    btn.setAttribute('aria-label', 'Open Prompt Manager');
    btn.innerHTML = GEAR_ICON + ' Prompts';
    btn.addEventListener('click', function() { openPromptManager(btn); });
    searchBar.appendChild(btn);
  }

  /* ════════════════════════════════════════════════
     Observer + Init
     ════════════════════════════════════════════════ */
  var readerContent = document.getElementById('reader-content');
  if (readerContent) {
    var aiObserver = new MutationObserver(function() {
      injectExtractButtons();
      wireFloatingExtract();
      injectPromptManagerButton();
      injectReaderHeaderGear();
    });
    aiObserver.observe(readerContent, { childList: true, subtree: false });
  }

  function initAll() {
    injectExtractButtons();
    wireFloatingExtract();
    injectPromptManagerButton();
    injectReaderHeaderGear();
  }

  document.addEventListener('DOMContentLoaded', function() { setTimeout(initAll, 600); });
  initAll();

  window.aiExtract = {
    openPromptManager: openPromptManager,
    cache: aiExtractCache
  };
})();
