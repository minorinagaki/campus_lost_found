(() => {
  'use strict';

  const BUCKET = 'campus-item-images';
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const EWHA_EMAIL_DOMAINS = new Set(['ewha.ac.kr', 'ewhain.net']);
  const CATEGORIES = ['전자기기', '지갑·카드', '가방·소지품', '의류·잡화', '문구·책', '열쇠', '기타'];
  const config = window.CAMPUS_SUPABASE;
  const client = window.supabase?.createClient && config?.url && config?.key
    ? window.supabase.createClient(config.url, config.key)
    : null;

  let posts = [];
  let session = null;
  let profileName = '';
  let activeFormType = 'lost';
  let editingPost = null;
  let pendingFormType = null;
  let authMode = 'login';
  let accountMenuOpen = false;
  let backendAvailable = false;
  let toastTimer;
  let activeRecognition = null;
  let activeRecognitionButton = null;
  let recognitionHadResult = false;
  let activeRecorder = null;
  let activeRecorderStream = null;
  let activeRecorderButton = null;
  let voiceProcessing = false;
  let voiceStopTimer = null;
  let whisperTranscriberPromise = null;

  const list = document.querySelector('#post-list');
  const keyword = document.querySelector('#keyword');
  const kindFilter = document.querySelector('#kind-filter');
  const placeFilter = document.querySelector('#place-filter');
  const resultSummary = document.querySelector('#result-summary');
  const totalCount = document.querySelector('#total-count');
  const emptyState = document.querySelector('#empty-state');
  const formSection = document.querySelector('#report-form');
  const form = document.querySelector('#report-entry');
  const toast = document.querySelector('#toast');
  const authDialog = document.querySelector('#auth-dialog');
  const detailDialog = document.querySelector('#detail-dialog');
  const myPostsDialog = document.querySelector('#my-posts-dialog');
  const authForm = document.querySelector('#auth-form');
  const myPostList = document.querySelector('#my-post-list');
  const dateField = document.querySelector('[name="date"]');

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function prettyDate(isoDate) {
    if (!isoDate) return '';
    const [year, month, day] = String(isoDate).slice(0, 10).split('-').map(Number);
    return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
  }

  function todayISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function isEwhaEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    const at = email.lastIndexOf('@');
    return at > 0 && EWHA_EMAIL_DOMAINS.has(email.slice(at + 1));
  }

  async function makeBlurredImage(file) {
    if (!window.createImageBitmap) throw new Error('사진 블러 처리 기능을 지원하는 최신 브라우저가 필요해요.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.filter = `blur(${Math.max(12, Math.min(canvas.width, canvas.height) * 0.035)}px)`;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('사진 블러 처리에 실패했어요.')),
      'image/webp', 0.82
    ));
    return new File([blob], 'campus-item-blurred.webp', { type: 'image/webp' });
  }

  function requestBrowserPosition(options) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  async function getGeolocationPermissionState() {
    if (!navigator.permissions?.query) return 'unknown';
    try {
      return (await navigator.permissions.query({ name: 'geolocation' })).state;
    } catch (_) {
      return 'unknown';
    }
  }

  function describeLocationError(error, permissionState) {
    const code = Number(error?.code);
    if (code === 1) {
      return permissionState === 'granted'
        ? '이 사이트는 허용 상태지만 브라우저나 기기가 위치 요청을 거절했어요. 주소창의 사이트 설정과 기기 위치 서비스를 확인해 주세요.'
        : '현재 사이트 주소의 위치 권한을 확인해 주세요. 주소창의 사이트 설정에서 위치를 허용한 뒤 다시 눌러 주세요.';
    }
    if (code === 2) return '기기에서 위치 정보를 받지 못했어요. 기기의 위치 서비스와 Wi-Fi를 켠 뒤 다시 시도해 주세요.';
    if (code === 3) return '위치 조회가 시간 초과됐어요. 잠시 기다려 다시 누르거나 장소를 직접 입력해 주세요.';
    return '현재 위치를 확인하지 못했어요. 장소를 직접 입력해 주세요.';
  }

  async function lookupPlaceName(coords) {
    const cacheKey = `campus-place-${coords.latitude.toFixed(4)}-${coords.longitude.toFixed(4)}`;
    let placeName = sessionStorage.getItem(cacheKey);
    if (!placeName) {
      const url = new URL('https://photon.komoot.io/reverse');
      url.searchParams.set('lat', coords.latitude);
      url.searchParams.set('lon', coords.longitude);
      url.searchParams.set('limit', '1');
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('주변 건물 검색 서비스에 연결하지 못했어요.');
      const result = await response.json();
      const properties = result.features?.[0]?.properties;
      placeName = properties?.name || properties?.building || properties?.street || '';
      if (placeName) sessionStorage.setItem(cacheKey, placeName);
    }
    return placeName;
  }

  async function getCurrentLocation() {
    if (!navigator.geolocation) return showToast('이 브라우저는 위치 조회를 지원하지 않아요. 장소를 직접 입력해 주세요.');
    if (!window.isSecureContext) return showToast('GPS를 사용하려면 HTTPS 사이트 또는 localhost로 접속해 주세요.');

    const button = document.querySelector('#use-current-location');
    const note = document.querySelector('#gps-status');
    if (button.disabled) return;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = '위치 찾는 중…';
    note.textContent = '현재 사이트의 위치 권한과 기기 위치를 확인하고 있어요.';

    try {
      const permissionState = await getGeolocationPermissionState();
      let position;
      try {
        position = await requestBrowserPosition({
          enableHighAccuracy: false,
          timeout: 20000,
          maximumAge: 60000
        });
      } catch (firstError) {
        const firstCode = Number(firstError?.code);
        if (firstCode !== 2 && firstCode !== 3) throw firstError;
        note.textContent = '위치를 더 정확하게 다시 확인하고 있어요.';
        position = await requestBrowserPosition({
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 120000
        });
      }

      note.textContent = '주변 건물명을 찾고 있어요. 정확한 GPS 좌표는 게시글에 공개되지 않습니다.';
      const placeName = await lookupPlaceName(position.coords);
      if (!placeName) {
        note.textContent = '주변 건물을 찾지 못했어요. 건물명과 층을 직접 입력해 주세요.';
        showToast('GPS 위치는 확인했지만 건물을 찾지 못했어요.');
        return;
      }
      form.elements.place.value = placeName.slice(0, 50);
      form.elements.place.dispatchEvent(new Event('input', { bubbles: true }));
      note.textContent = `주변 장소를 찾았어요: ${placeName}. 건물명과 층을 확인해 주세요.`;
      showToast('GPS로 주변 장소를 찾았어요. 건물명과 층을 확인해 주세요.');
    } catch (error) {
      const message = error?.code
        ? describeLocationError(error, await getGeolocationPermissionState())
        : error?.message || '주변 건물을 찾지 못했어요. 장소를 직접 입력해 주세요.';
      note.textContent = message;
      showToast(message);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3600);
  }

  function getAuthRedirectUrl() {
    if (window.location.protocol === 'file:') return 'http://localhost:3000/';
    return `${window.location.origin}${window.location.pathname}`;
  }

  function setVoiceStatus(message) {
    const status = document.querySelector('#voice-status');
    if (status) status.textContent = message;
  }

  function restoreVoiceControls(button) {
    if (button) button.textContent = button.dataset.voiceLabel || '🎙 음성 입력';
    form.querySelectorAll('[data-voice-target]').forEach((control) => { control.disabled = false; });
  }

  function appendVoiceText(target, transcript) {
    const separator = target instanceof HTMLTextAreaElement ? '\n' : ' ';
    const value = [target.value.trim(), transcript.trim()].filter(Boolean).join(separator);
    target.value = target.maxLength > 0 ? value.slice(0, target.maxLength) : value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function getWhisperTranscriber() {
    if (!whisperTranscriberPromise) {
      setVoiceStatus('음성 인식 모델을 준비하고 있어요. 처음에는 다운로드에 시간이 걸릴 수 있어요.');
      const moduleUrl = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm';
      whisperTranscriberPromise = import(moduleUrl)
        .then(({ pipeline }) => pipeline(
          'automatic-speech-recognition',
          'onnx-community/whisper-tiny',
          { dtype: 'q8' }
        ))
        .catch((error) => {
          whisperTranscriberPromise = null;
          throw error;
        });
    }
    return whisperTranscriberPromise;
  }

  async function transcribeRecordedAudio(blob) {
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    const OfflineAudioContextType = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioContextType || !OfflineAudioContextType) {
      throw new Error('이 브라우저에서는 녹음 음성을 변환할 수 없어요. Chrome이나 Edge를 사용해 주세요.');
    }

    const audioContext = new AudioContextType();
    let samples;
    try {
      const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
      if (decoded.duration > 30) throw new Error('한 번에 30초 이내로 말씀해 주세요.');
      const mono = audioContext.createBuffer(1, decoded.length, decoded.sampleRate);
      const monoSamples = mono.getChannelData(0);
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const channelSamples = decoded.getChannelData(channel);
        for (let index = 0; index < decoded.length; index += 1) {
          monoSamples[index] += channelSamples[index] / decoded.numberOfChannels;
        }
      }

      const outputLength = Math.ceil(decoded.duration * 16000);
      const offlineContext = new OfflineAudioContextType(1, outputLength, 16000);
      const source = offlineContext.createBufferSource();
      source.buffer = mono;
      source.connect(offlineContext.destination);
      source.start();
      samples = (await offlineContext.startRendering()).getChannelData(0);
    } finally {
      await audioContext.close();
    }

    setVoiceStatus('녹음한 음성을 기기에서 글자로 바꾸고 있어요.');
    const transcriber = await getWhisperTranscriber();
    const result = await transcriber(samples, { language: 'korean', task: 'transcribe' });
    return String(result?.text || '').trim();
  }

  async function startRecordedVoiceInput(button, target) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      showToast('이 브라우저에서는 마이크 녹음을 지원하지 않아요. Chrome이나 Edge를 사용해 주세요.');
      return;
    }
    voiceProcessing = true;
    activeRecorderButton = button;
    button.textContent = '마이크 준비 중…';
    form.querySelectorAll('[data-voice-target]').forEach((control) => { control.disabled = true; });
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
        .find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks = [];
      activeRecorder = recorder;
      activeRecorderStream = stream;
      voiceProcessing = false;
      button.textContent = '■ 녹음 완료';
      form.querySelectorAll('[data-voice-target]').forEach((control) => {
        if (control !== button) control.disabled = true;
      });
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) chunks.push(event.data);
      });
      recorder.addEventListener('stop', async () => {
        activeRecorder = null;
        voiceProcessing = true;
        button.textContent = '음성 인식 중…';
        setVoiceStatus('녹음한 음성을 처리하고 있어요.');
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          if (!blob.size) throw new Error('녹음된 음성이 없어요. 다시 말씀해 주세요.');
          const transcript = await transcribeRecordedAudio(blob);
          if (!transcript) throw new Error('음성을 알아듣지 못했어요. 다시 말씀해 주세요.');
          appendVoiceText(target, transcript);
          setVoiceStatus('음성을 입력했어요. 입력된 문장을 확인해 주세요.');
          showToast('음성을 입력했어요. 내용을 확인해 주세요.');
        } catch (error) {
          setVoiceStatus(error.message || '음성을 입력하지 못했어요.');
          showToast(error.message || '음성을 입력하지 못했어요.');
        } finally {
          if (voiceStopTimer) clearTimeout(voiceStopTimer);
          voiceStopTimer = null;
          stream.getTracks().forEach((track) => track.stop());
          activeRecorderStream = null;
          activeRecorderButton = null;
          voiceProcessing = false;
          restoreVoiceControls(button);
        }
      }, { once: true });
      recorder.start();
      voiceStopTimer = setTimeout(() => {
        if (activeRecorder === recorder && recorder.state === 'recording') recorder.stop();
      }, 30000);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      activeRecorder = null;
      activeRecorderStream = null;
      activeRecorderButton = null;
      voiceProcessing = false;
      restoreVoiceControls(button);
      const message = error.name === 'NotAllowedError'
        ? '마이크 사용을 허용해 주세요.'
        : error.message || '녹음을 시작하지 못했어요.';
      setVoiceStatus(message);
      showToast(message);
    }
  }

  function startVoiceInput(button) {
    if (activeRecorder) {
      if (activeRecorderButton === button && activeRecorder.state === 'recording') activeRecorder.stop();
      else showToast('현재 음성 입력을 먼저 마쳐 주세요.');
      return;
    }
    if (voiceProcessing) {
      showToast('음성 입력을 처리하고 있어요. 잠시 기다려 주세요.');
      return;
    }
    if (activeRecognition) {
      if (activeRecognitionButton === button) activeRecognition.stop();
      else showToast('현재 음성 입력을 먼저 마쳐 주세요.');
      return;
    }
    const target = form.elements.namedItem(button.dataset.voiceTarget);
    if (!target) return;

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      void startRecordedVoiceInput(button, target);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    activeRecognition = recognition;
    activeRecognitionButton = button;
    recognitionHadResult = false;
    button.textContent = '■ 음성 입력 중지';
    form.querySelectorAll('[data-voice-target]').forEach((control) => {
      if (control !== button) control.disabled = true;
    });

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      appendVoiceText(target, transcript);
      recognitionHadResult = true;
    };
    recognition.onerror = (event) => {
      const message = event.error === 'not-allowed'
        ? '마이크 사용을 허용해 주세요.'
        : event.error === 'no-speech'
          ? '음성이 들리지 않았어요. 다시 말씀해 주세요.'
          : '브라우저 음성 인식을 사용할 수 없어요. 다시 눌러 기기 내 음성 인식을 시도해 주세요.';
      if (event.error !== 'not-allowed' && event.error !== 'no-speech') {
        recognition.onend = () => {
          activeRecognition = null;
          activeRecognitionButton = null;
          void startRecordedVoiceInput(button, target);
        };
      }
      showToast(message);
    };
    recognition.onend = () => {
      const hadResult = recognitionHadResult;
      activeRecognition = null;
      activeRecognitionButton = null;
      restoreVoiceControls(button);
      if (hadResult) showToast('음성을 입력했어요. 내용을 확인해 주세요.');
    };
    try {
      recognition.start();
    } catch (_) {
      activeRecognition = null;
      activeRecognitionButton = null;
      void startRecordedVoiceInput(button, target);
    }
  }

  function normalizePost(row) {
    return {
      id: row.id,
      ownerId: row.user_id,
      type: row.item_type,
      status: row.status || 'open',
      title: row.title,
      kind: row.category,
      date: row.item_date,
      place: row.location,
      description: row.description || '',
      imageUrl: row.image_url || '',
      verificationQuestion: row.verification_question || '',
      createdAt: row.created_at
    };
  }

  function refreshOptions(select, key, label) {
    const previous = select.value;
    const values = posts.map((post) => post[key]).filter(Boolean);
    if (key === 'kind') values.push(...CATEGORIES);
    const options = [...new Set(values)]
      .sort((a, b) => a.localeCompare(b, 'ko'));
    select.innerHTML = `<option value="all">전체 ${label}</option>` + options.map((option) =>
      `<option value="${escapeHTML(option)}">${escapeHTML(option)}</option>`).join('');
    if (options.includes(previous)) select.value = previous;
  }

  function getFilteredPosts() {
    const term = keyword.value.trim().toLocaleLowerCase('ko');
    const type = document.querySelector('input[name="post-type"]:checked').value;
    return posts.filter((post) => {
      const searchable = [post.title, post.description, post.place, post.kind]
        .some((part) => String(part || '').toLocaleLowerCase('ko').includes(term));
      return (!term || searchable) && (kindFilter.value === 'all' || post.kind === kindFilter.value) &&
        (placeFilter.value === 'all' || post.place === placeFilter.value) &&
        (type === 'all' || post.type === type);
    });
  }

  function typeBadge(post) {
    const isLost = post.type === 'lost';
    const name = isLost ? '분실' : '습득';
    const label = isLost ? 'LOST' : 'FOUND';
    const returned = post.status === 'returned'
      ? '<span class="type-badge returned">반환 완료</span>' : '';
    return `<span class="type-badge ${isLost ? 'lost' : 'found'}">${label} · ${name}</span>${returned}`;
  }

  function renderCard(post) {
    const typeName = post.type === 'lost' ? '분실' : '습득';
    const shareLabel = `${typeName} 소식 공유: ${post.title}`;
    const image = post.imageUrl
      ? `<img class="card-image" src="${escapeHTML(post.imageUrl)}" alt="블러 처리된 ${escapeHTML(post.title)} 사진" loading="lazy">` : '';
    return `<article class="post-card" data-post-id="${escapeHTML(post.id)}">
      <div class="card-top"><div class="card-badges">${typeBadge(post)}<span class="kind-badge">${escapeHTML(post.kind)}</span></div><time class="card-date" datetime="${escapeHTML(post.date)}">${prettyDate(post.date)}</time></div>
      ${image}<button type="button" class="card-title card-title-button" data-detail-id="${escapeHTML(post.id)}">${escapeHTML(post.title)}</button>
      <p class="card-description">${escapeHTML(post.description || '자세한 특징은 등록한 분이 남긴 소식을 확인해 주세요.')}</p>
      <div class="card-meta"><span class="meta-dot" aria-hidden="true">⌖</span><span class="meta-place">${escapeHTML(post.place)}</span><button type="button" class="share-button" data-share-id="${escapeHTML(post.id)}" aria-label="${escapeHTML(shareLabel)}"><span aria-hidden="true">↗</span> 공유</button></div>
    </article>`;
  }

  function render() {
    refreshOptions(kindFilter, 'kind', '종류');
    refreshOptions(placeFilter, 'place', '장소');
    const filtered = getFilteredPosts();
    totalCount.textContent = posts.length;
    resultSummary.innerHTML = `전체 <strong>${filtered.length}</strong>개의 소식이 있어요.`;
    list.innerHTML = filtered.map(renderCard).join('');
    emptyState.hidden = filtered.length !== 0;
    list.hidden = filtered.length === 0;
    list.setAttribute('aria-busy', 'false');
  }

  async function loadPosts({ quiet = false } = {}) {
    if (!client) {
      resultSummary.textContent = 'Supabase 설정을 불러오지 못했어요.';
      if (!quiet) showToast('Supabase 설정과 네트워크를 확인해 주세요.');
      return;
    }
    list.setAttribute('aria-busy', 'true');
    resultSummary.textContent = '소식을 불러오는 중이에요.';
    const rows = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await client.from('items')
        .select('id,user_id,item_type,status,title,description,category,location,item_date,image_url,verification_question,created_at')
        .order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
      if (error) {
        backendAvailable = false;
        syncAccountControls();
        list.setAttribute('aria-busy', 'false');
        resultSummary.textContent = '소식을 불러오지 못했어요.';
        if (!quiet) showToast(`게시물을 불러오지 못했어요: ${error.message}`);
        return;
      }
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    backendAvailable = true;
    syncAccountControls();
    posts = rows.map(normalizePost);
    render();
  }

  async function loadProfile() {
    profileName = '';
    if (client && session?.user?.id) {
      const { data } = await client.from('profiles').select('display_name')
        .eq('id', session.user.id).maybeSingle();
      profileName = data?.display_name || session.user.user_metadata?.display_name || '';
    }
    syncAccountControls();
  }

  function syncAccountControls() {
    const loginButton = document.querySelector('#open-auth');
    const accountButton = document.querySelector('#account-menu-button');
    const accountMenu = document.querySelector('#account-menu');
    loginButton.hidden = Boolean(session);
    accountButton.hidden = !session;
    accountButton.title = profileName || '내 계정';
    accountMenuOpen = Boolean(session) && accountMenuOpen;
    accountButton.setAttribute('aria-expanded', String(accountMenuOpen));
    accountMenu.hidden = !accountMenuOpen;
    document.querySelector('#connection-status').textContent = !client
      ? 'SUPABASE OFFLINE' : backendAvailable ? 'SUPABASE · LIVE' : 'SUPABASE · 연결 중';
  }

  async function refreshAuthenticatedView() {
    await loadProfile();
    await loadPosts({ quiet: true });
    if (pendingFormType && session) {
      const type = pendingFormType;
      pendingFormType = null;
      openForm(type);
    }
  }

  function openAuth(mode = 'login') {
    authMode = mode;
    renderAuthMode();
    authDialog.showModal();
  }

  function renderAuthMode() {
    const isSignup = authMode === 'signup';
    document.querySelector('#auth-title').innerHTML = isSignup
      ? '회원가입<span class="heading-period">.</span>' : '로그인<span class="heading-period">.</span>';
    document.querySelector('#display-name-field').hidden = !isSignup;
    authForm.elements.display_name.required = isSignup;
    authForm.elements.password.autocomplete = isSignup ? 'new-password' : 'current-password';
    document.querySelector('#auth-submit').textContent = isSignup ? '회원가입' : '로그인';
    document.querySelector('#auth-note').textContent = isSignup
      ? 'ewha.ac.kr 또는 ewhain.net 이메일만 가입할 수 있어요. 이름은 게시판에서 표시됩니다.'
      : '게시물을 등록하고 관리하려면 로그인해 주세요.';
    document.querySelector('#toggle-auth-mode').textContent = isSignup
      ? '이미 계정이 있나요? 로그인' : '처음 오셨나요? 회원가입';
  }

  function setFormType(type) {
    activeFormType = type;
    const found = type === 'found';
    document.querySelector('#form-title').textContent = found ? '습득 소식 남기기.' : '분실 소식 남기기.';
    document.querySelector('#form-intro').textContent = found
      ? '주인을 기다리는 물건의 정보를 적어주세요.' : '잃어버린 물건을 알아볼 수 있게 적어주세요.';
    document.querySelectorAll('[data-form-type]').forEach((button) => {
      const selected = button.dataset.formType === type;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function openForm(type) {
    if (!session) {
      pendingFormType = type;
      showToast('소식을 등록하려면 먼저 로그인해 주세요.');
      openAuth('login');
      return;
    }
    editingPost = null;
    form.reset();
    form.elements.verification_answer.required = true;
    form.elements.verification_answer.placeholder = '정답은 게시글에 공개되지 않아요.';
    document.querySelector('#gps-status').textContent = 'GPS는 선택사항이며 장소를 직접 입력할 수도 있어요.';
    dateField.value = todayISO();
    document.querySelector('#char-count').textContent = '0';
    document.querySelector('#form-save-note').textContent = '등록한 내용은 Supabase에 안전하게 저장됩니다.';
    document.querySelector('#submit-post').innerHTML = '소식 등록하기 <span aria-hidden="true">↗</span>';
    setFormType(type);
    formSection.hidden = false;
    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelector('[name="title"]').focus({ preventScroll: true });
  }

  function beginEdit(post) {
    if (!session || post.ownerId !== session.user.id) return;
    editingPost = post;
    form.reset();
    setFormType(post.type);
    form.elements.title.value = post.title;
    form.elements.kind.value = post.kind;
    form.elements.date.value = post.date;
    form.elements.place.value = post.place;
    form.elements.description.value = post.description;
    form.elements.verification_question.value = post.verificationQuestion;
    form.elements.verification_answer.required = false;
    form.elements.verification_answer.placeholder = '확인 답변을 바꾸려면 새 답을 입력해 주세요.';
    document.querySelector('#char-count').textContent = post.description.length;
    document.querySelector('#form-save-note').textContent = '수정한 내용이 Supabase에 저장됩니다.';
    document.querySelector('#submit-post').innerHTML = '수정 내용 저장 <span aria-hidden="true">↗</span>';
    myPostsDialog.close();
    detailDialog.close();
    formSection.hidden = false;
    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.title.focus({ preventScroll: true });
  }

  function makeShareText(post) {
    const label = post.type === 'lost' ? '분실' : '습득';
    return `[교내 분실물 소식 · ${label}] ${post.title}\n종류: ${post.kind}\n장소: ${post.place}\n날짜: ${prettyDate(post.date)}\n${post.description ? `${post.description}\n` : ''}다시, 너에게 — 잃어버린 물건, 함께 찾아요`;
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('클립보드 복사에 실패했습니다.');
  }

  async function sharePost(post) {
    const text = makeShareText(post);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${post.type === 'lost' ? '분실' : '습득'} 소식: ${post.title}`, text });
        showToast('공유 창을 열었어요.');
        return;
      } catch (_) { /* 공유가 취소되면 복사로 이어집니다. */ }
    }
    try {
      await copyText(text);
      showToast('소식 내용을 클립보드에 복사했어요.');
    } catch (_) {
      showToast('복사할 수 없어요. 브라우저의 클립보드 권한을 확인해 주세요.');
    }
  }

  function openDetail(post) {
    const image = post.imageUrl
      ? `<img class="detail-image" src="${escapeHTML(post.imageUrl)}" alt="블러 처리된 ${escapeHTML(post.title)} 사진">` : '';
    const ownActions = session?.user?.id === post.ownerId
      ? '<button class="button button-outline" type="button" data-open-my-posts>내 게시물 관리</button>' : '';
    document.querySelector('#detail-content').innerHTML = `${image}
      <div class="detail-badges">${typeBadge(post)}<span class="kind-badge">${escapeHTML(post.kind)}</span></div>
      <h3 class="detail-title">${escapeHTML(post.title)}</h3>
      <div class="detail-meta"><div><span>장소</span>${escapeHTML(post.place)}</div><div><span>날짜</span>${prettyDate(post.date)}</div><div><span>상태</span>${post.status === 'returned' ? '반환 완료' : '진행 중'}</div><div><span>유형</span>${post.type === 'lost' ? '분실' : '습득'}</div></div>
      <p class="detail-description">${escapeHTML(post.description || '추가 설명이 없습니다.')}</p>
      ${ownActions || post.status !== 'open' ? '' : `<section class="claim-box"><h4>물건 확인하기</h4><p>${escapeHTML(post.verificationQuestion || '게시자가 확인 질문을 등록하지 않았어요.')}</p>${post.verificationQuestion ? `<form id="claim-answer-form" data-item-id="${escapeHTML(post.id)}"><label class="field"><span>답변</span><input name="answer" required maxlength="120" autocomplete="off" placeholder="물건의 특징을 입력해 주세요."></label><button class="button button-dark" type="submit">답변 확인</button></form><div id="claim-result" aria-live="polite"></div>` : ''}</section>`}
      <div class="detail-actions"><button class="button button-outline" type="button" data-share-id="${escapeHTML(post.id)}">공유</button>${ownActions}</div>`;
    detailDialog.showModal();
  }

  async function verifyItemAnswer(event) {
    event.preventDefault();
    const answerForm = event.target.closest('#claim-answer-form');
    if (!answerForm) return;
    if (!answerForm.reportValidity()) return;
    if (!session) return openAuth('login');
    const button = answerForm.querySelector('button[type="submit"]');
    const resultBox = document.querySelector('#claim-result');
    button.disabled = true;
    try {
      const { data, error } = await client.rpc('verify_item_answer', {
        p_item_id: answerForm.dataset.itemId,
        p_answer: answerForm.elements.answer.value.trim()
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (result?.is_match && result.contact_email) {
        const post = posts.find((item) => item.id === answerForm.dataset.itemId);
        resultBox.innerHTML = `<p>확인됐어요. 아래 버튼으로 등록자에게 연락해 주세요.</p><a class="button button-dark" href="mailto:${escapeHTML(result.contact_email)}?subject=${encodeURIComponent(`[다시, 너에게] ${post?.title || '분실물 문의'}`)}">등록자에게 이메일 보내기</a>`;
        answerForm.hidden = true;
      } else {
        resultBox.textContent = '답변이 일치하지 않거나 확인 시도가 잠시 제한됐어요.';
      }
    } catch (error) {
      resultBox.textContent = error.message || '답변을 확인하지 못했어요.';
    } finally {
      button.disabled = false;
    }
  }

  function renderMyPost(post) {
    const image = post.imageUrl
      ? `<img class="card-image" src="${escapeHTML(post.imageUrl)}" alt="블러 처리된 ${escapeHTML(post.title)} 사진" loading="lazy">` : '';
    return `<article class="my-post-card" data-my-post-id="${escapeHTML(post.id)}">
      <div class="card-top"><div class="card-badges">${typeBadge(post)}<span class="kind-badge">${escapeHTML(post.kind)}</span></div><time class="card-date">${prettyDate(post.date)}</time></div>
      ${image}<h3 class="card-title">${escapeHTML(post.title)}</h3><p class="card-description">${escapeHTML(post.description || '추가 설명이 없습니다.')}</p>
      <div class="my-post-controls"><label class="sr-only" for="status-${escapeHTML(post.id)}">${escapeHTML(post.title)} 상태</label><select id="status-${escapeHTML(post.id)}" data-status-id="${escapeHTML(post.id)}"><option value="open" ${post.status === 'open' ? 'selected' : ''}>진행 중</option><option value="returned" ${post.status === 'returned' ? 'selected' : ''}>반환 완료</option></select><button type="button" data-edit-id="${escapeHTML(post.id)}">수정</button><button type="button" data-delete-id="${escapeHTML(post.id)}">삭제</button></div>
    </article>`;
  }

  async function loadMyPosts() {
    if (!session) return openAuth('login');
    myPostList.innerHTML = '<p class="my-post-empty">내 게시물을 불러오는 중이에요.</p>';
    if (!myPostsDialog.open) myPostsDialog.showModal();
    const { data, error } = await client.from('items')
      .select('id,user_id,item_type,status,title,description,category,location,item_date,image_url,verification_question,created_at')
      .eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(500);
    if (error) {
      myPostList.innerHTML = '<p class="my-post-empty">내 게시물을 불러오지 못했어요.</p>';
      showToast(`내 게시물을 불러오지 못했어요: ${error.message}`);
      return;
    }
    const ownPosts = (data || []).map(normalizePost);
    myPostList.innerHTML = ownPosts.length
      ? ownPosts.map(renderMyPost).join('')
      : '<p class="my-post-empty">아직 등록한 소식이 없어요.</p>';
  }

  function getOwnedStoragePath(imageUrl, userId) {
    if (!imageUrl) return null;
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const index = imageUrl.indexOf(marker);
    if (index < 0) return null;
    const path = decodeURIComponent(imageUrl.slice(index + marker.length));
    return path.startsWith(`${userId}/`) ? path : null;
  }

  async function removeOwnImage(imageUrl, userId) {
    const path = getOwnedStoragePath(imageUrl, userId);
    if (!path) return;
    const { error } = await client.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  }

  async function updateStatus(postId, status) {
    if (!session || !['open', 'returned'].includes(status)) return;
    const { error } = await client.from('items').update({ status })
      .eq('id', postId).eq('user_id', session.user.id).select('id').single();
    if (error) {
      showToast(`상태를 바꾸지 못했어요: ${error.message}`);
      await loadMyPosts();
      return;
    }
    showToast(status === 'returned' ? '반환 완료로 변경했어요.' : '진행 중으로 변경했어요.');
    await loadPosts({ quiet: true });
    await loadMyPosts();
  }

  async function deletePost(postId) {
    if (!session) return;
    const post = posts.find((item) => item.id === postId);
    if (!post || post.ownerId !== session.user.id) return;
    if (!window.confirm('이 게시물을 삭제할까요?')) return;
    const { error } = await client.from('items').delete()
      .eq('id', post.id).eq('user_id', session.user.id).select('id').single();
    if (error) {
      showToast(`게시물을 삭제하지 못했어요: ${error.message}`);
      return;
    }
    try { await removeOwnImage(post.imageUrl, session.user.id); }
    catch (_) { showToast('게시물은 삭제했지만 사진 정리에 실패했어요.'); }
    showToast('게시물을 삭제했어요.');
    await loadPosts({ quiet: true });
    await loadMyPosts();
  }

  async function uploadImage(file, userId, postId) {
    if (!file) return null;
    if (!IMAGE_TYPES.has(file.type)) throw new Error('JPG, PNG, WEBP 사진만 등록할 수 있어요.');
    if (file.size > MAX_IMAGE_SIZE) throw new Error('사진은 5MB 이하로 선택해 주세요.');
    const blurredFile = await makeBlurredImage(file);
    const extension = 'webp';
    const objectPath = `${userId}/${postId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client.storage.from(BUCKET).upload(objectPath, blurredFile, {
      cacheControl: '3600', upsert: false, contentType: 'image/webp'
    });
    if (error) throw error;
    return { path: objectPath, url: client.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl };
  }

  async function savePost(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!session) return openAuth('login');
    const file = form.elements.image.files?.[0] || null;
    const verificationAnswer = form.elements.verification_answer.value.trim();
    const verificationQuestion = form.elements.verification_question.value.trim();
    const previousPost = editingPost;
    if (previousPost && !verificationAnswer && verificationQuestion !== previousPost.verificationQuestion) {
      showToast('확인 질문을 바꾸려면 정답도 새로 입력해 주세요.');
      return;
    }
    const submitButton = document.querySelector('#submit-post');
    submitButton.disabled = true;
    const postId = previousPost?.id || crypto.randomUUID();
    let uploaded = null;
    try {
      uploaded = await uploadImage(file, session.user.id, postId);
      const data = new FormData(form);
      const payload = {
        title: String(data.get('title')).trim(),
        description: String(data.get('description') || '').trim() || null,
        category: String(data.get('kind')),
        location: String(data.get('place')).trim(),
        item_date: String(data.get('date')),
        image_url: uploaded?.url || previousPost?.imageUrl || null,
        item_type: activeFormType,
        status: previousPost?.status || 'open',
        verification_question: verificationQuestion
      };
      if (!previousPost || verificationAnswer) payload.verification_answer_hash = verificationAnswer;
      let query = previousPost
        ? client.from('items').update(payload).eq('id', postId).eq('user_id', session.user.id)
        : client.from('items').insert({ ...payload, id: postId, user_id: session.user.id });
      const { error } = await query.select('id').single();
      if (error) throw error;
      if (uploaded && previousPost?.imageUrl) {
        try { await removeOwnImage(previousPost.imageUrl, session.user.id); }
        catch (_) { showToast('게시물은 저장했지만 이전 사진 정리에 실패했어요.'); }
      }
      showToast(previousPost ? '게시물을 수정했어요.' : '소식을 등록했어요.');
      editingPost = null;
      form.reset();
      form.elements.verification_answer.required = true;
      form.elements.verification_answer.placeholder = '정답은 게시글에 공개되지 않아요.';
      dateField.value = todayISO();
      document.querySelector('#char-count').textContent = '0';
      formSection.hidden = true;
      await loadPosts({ quiet: true });
      document.querySelector('#find').scrollIntoView({ behavior: 'smooth' });
      if (myPostsDialog.open) await loadMyPosts();
    } catch (error) {
      if (uploaded?.path) {
        const { error: cleanupError } = await client.storage.from(BUCKET).remove([uploaded.path]);
        if (cleanupError) console.error('Failed to clean up uploaded image:', cleanupError);
      }
      showToast(error.message || '게시물을 저장하지 못했어요.');
    } finally {
      submitButton.disabled = false;
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (!authForm.reportValidity()) return;
    if (!client) return showToast('Supabase 설정이 없어 로그인할 수 없어요.');
    const email = authForm.elements.email.value.trim();
    if (!isEwhaEmail(email)) {
      showToast('ewha.ac.kr 또는 ewhain.net 이메일만 사용할 수 있어요.');
      return;
    }
    const submit = document.querySelector('#auth-submit');
    submit.disabled = true;
    const password = authForm.elements.password.value;
    try {
      if (authMode === 'signup') {
        const displayName = authForm.elements.display_name.value.trim();
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: getAuthRedirectUrl()
          }
        });
        if (error) throw error;
        authDialog.close();
        authForm.reset();
        if (data.session) showToast('회원가입과 로그인이 완료됐어요.');
        else showToast('인증 이메일의 링크를 눌러 가입을 완료해 주세요. 이 페이지로 돌아옵니다.');
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        authDialog.close();
        authForm.reset();
        showToast('로그인했어요.');
      }
    } catch (error) {
      showToast(error.message || '인증에 실패했어요. 입력 내용을 확인해 주세요.');
    } finally {
      submit.disabled = false;
    }
  }

  document.querySelectorAll('[data-open-form]').forEach((button) =>
    button.addEventListener('click', () => openForm(button.dataset.openForm)));
  document.querySelectorAll('[data-form-type]').forEach((button) =>
    button.addEventListener('click', () => setFormType(button.dataset.formType)));
  [keyword, kindFilter, placeFilter].forEach((control) =>
    control.addEventListener(control === keyword ? 'input' : 'change', render));
  document.querySelectorAll('input[name="post-type"]').forEach((radio) => radio.addEventListener('change', render));
  document.querySelector('#reset-filters').addEventListener('click', () => {
    keyword.value = '';
    kindFilter.value = 'all';
    placeFilter.value = 'all';
    document.querySelector('input[name="post-type"][value="all"]').checked = true;
    render();
  });
  document.querySelector('#empty-reset').addEventListener('click', () => {
    keyword.value = '';
    kindFilter.value = 'all';
    placeFilter.value = 'all';
    document.querySelector('input[name="post-type"][value="all"]').checked = true;
    render();
  });
  document.querySelector('#close-form').addEventListener('click', () => {
    if (activeRecognition) activeRecognition.stop();
    formSection.hidden = true;
    editingPost = null;
  });
  list.addEventListener('click', (event) => {
    const shareButton = event.target.closest('[data-share-id]');
    if (shareButton) {
      const post = posts.find((item) => item.id === shareButton.dataset.shareId);
      if (post) void sharePost(post);
      return;
    }
    const detailButton = event.target.closest('[data-detail-id]');
    if (detailButton) {
      const post = posts.find((item) => item.id === detailButton.dataset.detailId);
      if (post) openDetail(post);
    }
  });
  document.querySelector('[name="description"]').addEventListener('input', (event) => {
    document.querySelector('#char-count').textContent = event.target.value.length;
  });
  form.addEventListener('submit', savePost);
  document.querySelector('#use-current-location').addEventListener('click', getCurrentLocation);
  document.querySelectorAll('[data-voice-target]').forEach((button) => {
    button.dataset.voiceLabel = button.textContent;
    button.addEventListener('click', () => startVoiceInput(button));
  });

  document.querySelector('#open-auth').addEventListener('click', () => openAuth('login'));
  document.querySelector('#account-menu-button').addEventListener('click', () => {
    accountMenuOpen = !accountMenuOpen;
    syncAccountControls();
  });
  document.querySelector('#open-my-posts').addEventListener('click', () => {
    accountMenuOpen = false;
    syncAccountControls();
    void loadMyPosts();
  });
  document.querySelector('#sign-out').addEventListener('click', async () => {
    accountMenuOpen = false;
    syncAccountControls();
    const { error } = await client.auth.signOut();
    if (error) showToast(`로그아웃하지 못했어요: ${error.message}`);
    else showToast('로그아웃했어요.');
  });
  document.querySelector('#toggle-auth-mode').addEventListener('click', () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    renderAuthMode();
  });
  authForm.addEventListener('submit', submitAuth);
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => {
    button.closest('dialog').close();
  }));
  document.querySelector('#detail-content').addEventListener('click', (event) => {
    const share = event.target.closest('[data-share-id]');
    if (share) {
      const post = posts.find((item) => item.id === share.dataset.shareId);
      if (post) void sharePost(post);
    }
    if (event.target.closest('[data-open-my-posts]')) {
      detailDialog.close();
      void loadMyPosts();
    }
  });
  document.querySelector('#detail-content').addEventListener('submit', (event) => {
    if (event.target.matches('#claim-answer-form')) void verifyItemAnswer(event);
  });
  myPostList.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-id]');
    if (edit) {
      const post = posts.find((item) => item.id === edit.dataset.editId);
      if (post) beginEdit(post);
      return;
    }
    const remove = event.target.closest('[data-delete-id]');
    if (remove) void deletePost(remove.dataset.deleteId);
  });
  myPostList.addEventListener('change', (event) => {
    const select = event.target.closest('[data-status-id]');
    if (select) void updateStatus(select.dataset.statusId, select.value);
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      keyword.focus();
      document.querySelector('#find').scrollIntoView({ behavior: 'smooth' });
    }
    if (event.key === 'Escape' && !formSection.hidden) {
      formSection.hidden = true;
      editingPost = null;
    }
    if (event.key === 'Escape' && accountMenuOpen) {
      accountMenuOpen = false;
      syncAccountControls();
    }
  });
  document.addEventListener('click', (event) => {
    if (accountMenuOpen && !event.target.closest('#account-actions')) {
      accountMenuOpen = false;
      syncAccountControls();
    }
  });

  if (!client) {
    syncAccountControls();
    resultSummary.textContent = 'Supabase 설정을 확인해 주세요.';
    emptyState.hidden = true;
  } else {
    client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      syncAccountControls();
      window.setTimeout(() => { void refreshAuthenticatedView(); }, 0);
    });
    client.auth.getSession().then(({ data, error }) => {
      if (error) showToast(`로그인 상태를 확인하지 못했어요: ${error.message}`);
      session = data?.session || null;
      syncAccountControls();
      void refreshAuthenticatedView();
    });
  }
  dateField.value = todayISO();
  render();
})();
