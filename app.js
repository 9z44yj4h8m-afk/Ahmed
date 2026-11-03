(() => {
  const $ = (id) => document.getElementById(id);
  const els = {
    list: $('channelList'), state: $('listState'), count: $('channelCount'), search: $('searchInput'),
    country: $('countryFilter'), type: $('typeFilter'), typeLabel: $('typeLabel'), category: $('categoryFilter'),
    categoryLabel: $('categoryLabel'), typeMenu: $('typeMenu'), categoryMenu: $('categoryMenu'),
    player: $('videoPlayer'), stage: $('playerStage'), empty: $('playerEmpty'), message: $('playerMessage'),
    live: $('liveLabel'), stageName: $('stageName'), stageCategory: $('stageCategory'), stageLogo: $('stageLogo'),
    detailLogo: $('detailLogo'), detailName: $('detailName'), detailMeta: $('detailMeta'), detailStatus: $('detailStatus'),
    quality: $('qualityPill'), play: $('playButton'), mute: $('muteButton'), fullscreen: $('fullscreenButton'),
    previous: $('previousButton'), next: $('nextButton'), detailPlay: $('detailPlayButton'), copy: $('copyLinkButton'),
    upload: $('uploadButton'), file: $('playlistFile'), reload: $('reloadButton'), listStatus: $('listStatus'), toast: $('toast')
  };
  let channels = [];
  let selected = -1;
  let selectedCategory = 'الكل';
  let selectedType = 'all';
  let hls = null;
  let toastTimer;

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeImageUrl = (value) => {
    try { const u = new URL(value, location.href); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; }
    catch { return ''; }
  };
  const attrsFrom = (text) => {
    const out = {};
    const re = /([\w-]+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(text))) out[m[1]] = m[2];
    return out;
  };
  function parseM3u(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('#EXTINF:')) continue;
      const comma = line.lastIndexOf(',');
      const metaText = comma >= 0 ? line.slice(0, comma) : line;
      const name = comma >= 0 ? line.slice(comma + 1).trim() : 'قناة بلا اسم';
      const attrs = attrsFrom(metaText);
      let stream = '';
      for (let j = i + 1; j < lines.length; j++) {
        const candidate = lines[j].trim();
        if (!candidate) continue;
        if (candidate.startsWith('#EXTINF:')) break;
        if (!candidate.startsWith('#')) { stream = candidate; i = j; break; }
      }
      if (!stream) continue;
      let url;
      try { url = new URL(stream, location.href); } catch { continue; }
      if (!['http:', 'https:', 'rtmp:'].includes(url.protocol)) continue;
      result.push({
        name, url: url.href, group: attrs['group-title'] || 'منوعات', logo: safeImageUrl(attrs['tvg-logo'] || ''),
        id: attrs['tvg-id'] || '', radio: /إذاعة|راديو|radio/i.test(`${name} ${attrs['group-title'] || ''}`),
        note: /محجوبة جغرافيًا|ليست متاحة طوال اليوم/.test(name) ? name.match(/\(([^)]*(?:محجوبة جغرافيًا|ليست متاحة طوال اليوم)[^)]*)\)/)?.[1] || '' : ''
      });
    }
    return result;
  }
  function showToast(text) {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2500);
  }
  function currentChannels() {
    const query = els.search.value.trim().toLocaleLowerCase('ar');
    return channels.map((channel, index) => ({...channel, index})).filter((item) => {
      const matchesQuery = !query || `${item.name} ${item.group}`.toLocaleLowerCase('ar').includes(query);
      const matchesCategory = selectedCategory === 'الكل' || item.group === selectedCategory;
      const matchesType = selectedType === 'all' || (selectedType === 'radio' ? item.radio : !item.radio);
      return matchesQuery && matchesCategory && matchesType;
    });
  }
  function updateCount() { els.count.textContent = currentChannels().length; }
  function renderChannels() {
    const items = currentChannels();
    els.list.innerHTML = '';
    updateCount();
    if (!channels.length) {
      els.state.textContent = 'لم يتم العثور على قنوات في القائمة.';
      return;
    }
    els.state.textContent = '';
    if (!items.length) {
      els.list.innerHTML = '<div class="empty-results">لا توجد نتائج مطابقة. جرّب كلمة بحث أو تصنيفًا آخر.</div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const channel of items) {
      const button = document.createElement('button');
      button.className = `channel-row${channel.index === selected ? ' selected' : ''}`;
      button.type = 'button'; button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', channel.index === selected ? 'true' : 'false');
      button.dataset.index = channel.index;
      const logo = channel.logo
        ? `<img src="${escapeHtml(channel.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.textContent='بث'">`
        : '<span>بث</span>';
      button.innerHTML = `<span class="channel-logo">${logo}</span><span class="channel-copy"><span class="channel-name">${escapeHtml(channel.name)}</span><span class="channel-sub">${escapeHtml(channel.group)} <span>•</span> السعودية</span></span><span class="row-play" aria-hidden="true">▶</span>`;
      button.addEventListener('click', () => selectChannel(channel.index, true));
      fragment.append(button);
    }
    els.list.append(fragment);
  }
  function setLogo(container, channel) {
    container.replaceChildren();
    if (channel?.logo) {
      const img = new Image(); img.src = channel.logo; img.alt = ''; img.referrerPolicy = 'no-referrer';
      img.onerror = () => { container.textContent = 'بث'; };
      container.append(img);
    } else container.textContent = channel ? (channel.name.slice(0, 2) || 'بث') : 'بث';
  }
  function showMessage(text, isError = false) {
    els.message.textContent = text;
    els.message.hidden = !text;
    els.message.style.borderColor = isError ? '#755044' : '';
    els.message.style.color = isError ? '#f0c1a7' : '';
  }
  function stopStream() {
    if (hls) { hls.destroy(); hls = null; }
    els.player.pause();
    els.player.removeAttribute('src');
    els.player.load();
    els.stage.classList.remove('playing', 'has-video');
    els.play.textContent = '▶'; els.play.title = 'تشغيل البث';
    showMessage('');
  }
  async function startStream() {
    if (selected < 0 || !channels[selected]) { showToast('اختر قناة أولًا'); return; }
    const channel = channels[selected];
    stopStream();
    els.live.textContent = 'جارٍ الاتصال بالبث';
    els.live.querySelector('.live-pip')?.classList.add('off');
    els.detailStatus.textContent = 'جارٍ الاتصال برابط البث…';
    const streamUrl = channel.url;
    if (streamUrl.startsWith('rtmp:')) {
      els.live.textContent = 'صيغة البث غير مدعومة';
      els.detailStatus.textContent = 'رابط القناة يستخدم RTMP، وهو غير مدعوم مباشرة في مشغلات المتصفح.';
      showMessage('هذا رابط RTMP؛ لا يمكن تشغيله مباشرةً في المتصفح.', true);
      return;
    }
    const isM3u8 = /\.m3u8(?:$|[?#])/i.test(streamUrl);
    try {
      if (isM3u8 && !els.player.canPlayType('application/vnd.apple.mpegurl') && window.Hls?.isSupported()) {
        hls = new window.Hls({enableWorker: true, lowLatencyMode: true, backBufferLength: 30});
        hls.loadSource(streamUrl);
        hls.attachMedia(els.player);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => els.player.play().catch(() => showMessage('اضغط تشغيل لبدء البث.')));
        hls.on(window.Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            els.detailStatus.textContent = 'تعذّر تشغيل هذا البث من المتصفح.';
            showMessage('تعذّر الاتصال — قد يكون البث غير متاح أو محجوبًا في منطقتك.', true);
            els.live.textContent = 'تعذّر الاتصال بالبث';
          }
        });
      } else {
        els.player.src = streamUrl;
        await els.player.play();
      }
    } catch {
      showMessage('اضغط تشغيل للمحاولة مجددًا.', true);
      els.detailStatus.textContent = 'لم يبدأ البث تلقائيًا؛ جرّب زر التشغيل مرة أخرى.';
    }
  }
  function updateSelectedDetails(channel) {
    els.stageName.textContent = channel.name;
    els.stageCategory.textContent = `${channel.group} • السعودية`;
    els.detailName.textContent = channel.name;
    els.detailMeta.innerHTML = `${escapeHtml(channel.group)} <span>•</span> السعودية <span>•</span> ${channel.radio ? 'إذاعة' : 'بث تلفزيوني'}`;
    els.quality.textContent = channel.radio ? 'إذاعة' : 'بث مباشر';
    els.live.textContent = 'القناة محددة';
    els.live.querySelector('.live-pip')?.classList.remove('off');
    els.detailStatus.textContent = channel.note || 'جاهزة للتشغيل — قد يعتمد توفر البث على منطقتك.';
    setLogo(els.stageLogo, channel); setLogo(els.detailLogo, channel);
  }
  function selectChannel(index, play) {
    if (!channels[index]) return;
    selected = index;
    updateSelectedDetails(channels[index]);
    renderChannels();
    const row = els.list.querySelector(`[data-index="${index}"]`);
    row?.scrollIntoView({block:'nearest',behavior:'smooth'});
    if (play) startStream(); else stopStream();
  }
  async function loadPlaylist(text) {
    stopStream();
    channels = parseM3u(text);
    selected = -1;
    selectedCategory = 'الكل';
    els.categoryLabel.textContent = 'التصنيفات';
    buildCategories(); renderChannels();
    els.listStatus.textContent = channels.length ? `${channels.length} قناة في القائمة` : 'لم تُحمّل القنوات';
    if (channels.length) {
      updateSelectedDetails(channels[0]);
      selected = 0;
      renderChannels();
      els.detailStatus.textContent = 'اختر تشغيل القناة لبدء المشاهدة.';
    } else {
      els.state.textContent = 'تعذّر قراءة الملف؛ تحقق من أنه بصيغة M3U.';
      showToast('لم نتمكن من قراءة قائمة M3U');
    }
  }
  function buildCategories() {
    const categories = ['الكل', ...new Set(channels.map(c => c.group).filter(Boolean))];
    els.categoryMenu.innerHTML = '';
    for (const category of categories) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = category;
      if (category === selectedCategory) button.classList.add('selected');
      button.addEventListener('click', () => {
        selectedCategory = category; els.categoryLabel.textContent = category === 'الكل' ? 'التصنيفات' : category;
        els.categoryMenu.hidden = true; els.category.setAttribute('aria-expanded','false'); renderChannels();
      });
      els.categoryMenu.append(button);
    }
  }
  async function fetchDefaultPlaylist() {
    els.state.textContent = 'جارٍ تحميل القنوات…';
    try {
      const response = await fetch('/sa.m3u', {cache:'no-cache'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await loadPlaylist(await response.text());
    } catch {
      els.state.textContent = 'تعذّر تحميل قائمة القنوات. استخدم زر الاستيراد لاختيار ملف M3U.';
      els.listStatus.textContent = 'القائمة غير متاحة';
    }
  }
  els.search.addEventListener('input', renderChannels);
  els.type.addEventListener('click', () => { els.typeMenu.hidden = !els.typeMenu.hidden; els.categoryMenu.hidden = true; });
  els.typeMenu.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-type]'); if (!button) return;
    selectedType = button.dataset.type;
    els.typeLabel.textContent = selectedType === 'radio' ? 'الإذاعات' : selectedType === 'tv' ? 'التلفزيون' : 'الكل';
    els.type.classList.add('active'); els.typeMenu.hidden = true; renderChannels();
  });
  els.category.addEventListener('click', () => {
    els.categoryMenu.hidden = !els.categoryMenu.hidden; els.typeMenu.hidden = true;
    els.category.setAttribute('aria-expanded', String(!els.categoryMenu.hidden));
  });
  els.country.addEventListener('click', () => { els.search.value = ''; selectedType = 'all'; selectedCategory = 'الكل'; els.typeLabel.textContent = 'الكل'; els.categoryLabel.textContent = 'التصنيفات'; renderChannels(); });
  els.play.addEventListener('click', () => els.player.paused ? startStream() : els.player.pause());
  els.detailPlay.addEventListener('click', startStream);
  els.previous.addEventListener('click', () => selectChannel((selected - 1 + channels.length) % channels.length, true));
  els.next.addEventListener('click', () => selectChannel((selected + 1) % channels.length, true));
  els.mute.addEventListener('click', () => { els.player.muted = !els.player.muted; els.mute.textContent = els.player.muted ? '◖×' : '◖))'; els.mute.title = els.player.muted ? 'إلغاء كتم الصوت' : 'كتم الصوت'; });
  els.fullscreen.addEventListener('click', async () => {
    try { if (!document.fullscreenElement) await els.stage.requestFullscreen(); else await document.exitFullscreen(); }
    catch { showToast('ملء الشاشة غير متاح في هذا المتصفح'); }
  });
  els.copy.addEventListener('click', async () => {
    if (selected < 0) return showToast('اختر قناة أولًا');
    try { await navigator.clipboard.writeText(channels[selected].url); showToast('تم نسخ رابط البث'); }
    catch { showToast('تعذّر نسخ الرابط في هذا المتصفح'); }
  });
  els.upload.addEventListener('click', () => els.file.click());
  els.file.addEventListener('change', async () => {
    const file = els.file.files?.[0]; if (!file) return;
    await loadPlaylist(await file.text()); showToast(`تم استيراد ${channels.length} قناة`); els.file.value = '';
  });
  els.reload.addEventListener('click', fetchDefaultPlaylist);
  $('startBrowseButton').addEventListener('click', () => $('searchInput').focus());
  $('playerMenuButton').addEventListener('click', () => $('detailName').scrollIntoView({behavior:'smooth',block:'nearest'}));
  $('videoPlayer').addEventListener('playing', () => {
    els.stage.classList.add('playing','has-video'); els.play.textContent = 'Ⅱ'; els.play.title = 'إيقاف مؤقت';
    els.live.textContent = 'يعمل الآن'; els.live.querySelector('.live-pip')?.classList.remove('off');
    els.detailStatus.textContent = 'البث يعمل الآن'; showMessage('');
  });
  $('videoPlayer').addEventListener('pause', () => {
    els.stage.classList.remove('playing'); els.play.textContent = '▶'; els.play.title = 'تشغيل البث';
    if (selected >= 0) { els.live.textContent = 'متوقف مؤقتًا'; els.detailStatus.textContent = 'البث متوقف مؤقتًا.'; }
  });
  $('videoPlayer').addEventListener('error', () => {
    if (selected < 0) return;
    els.live.textContent = 'تعذّر تشغيل البث';
    els.detailStatus.textContent = 'قد يكون رابط البث غير متاح أو محجوبًا جغرافيًا.';
    showMessage('تعذّر تشغيل القناة. قد يكون البث غير متاح أو محجوبًا في منطقتك.', true);
  });
  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input,textarea')) return;
    if (event.key === '/') { event.preventDefault(); els.search.focus(); }
    if (event.key === 'ArrowDown' && selected < channels.length - 1) selectChannel(selected + 1, false);
    if (event.key === 'ArrowUp' && selected > 0) selectChannel(selected - 1, false);
    if (event.key.toLowerCase() === 'f') els.fullscreen.click();
    if (event.key === 'Enter' && selected >= 0) startStream();
    if (event.key === ' ' && selected >= 0) { event.preventDefault(); els.play.click(); }
  });
  fetchDefaultPlaylist();
})();
