(() => {
  'use strict';

  const BUCKET = 'campus-item-images';
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
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

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3600);
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
      ? `<img class="card-image" src="${escapeHTML(post.imageUrl)}" alt="${escapeHTML(post.title)} 사진" loading="lazy">` : '';
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
        .select('id,user_id,item_type,status,title,description,category,location,item_date,image_url,created_at')
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
      ? '가입 후 이메일 인증이 필요할 수 있어요. 이름은 게시판에서 표시됩니다.'
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
      ? `<img class="detail-image" src="${escapeHTML(post.imageUrl)}" alt="${escapeHTML(post.title)} 사진">` : '';
    const ownActions = session?.user?.id === post.ownerId
      ? '<button class="button button-outline" type="button" data-open-my-posts>내 게시물 관리</button>' : '';
    document.querySelector('#detail-content').innerHTML = `${image}
      <div class="detail-badges">${typeBadge(post)}<span class="kind-badge">${escapeHTML(post.kind)}</span></div>
      <h3 class="detail-title">${escapeHTML(post.title)}</h3>
      <div class="detail-meta"><div><span>장소</span>${escapeHTML(post.place)}</div><div><span>날짜</span>${prettyDate(post.date)}</div><div><span>상태</span>${post.status === 'returned' ? '반환 완료' : '진행 중'}</div><div><span>유형</span>${post.type === 'lost' ? '분실' : '습득'}</div></div>
      <p class="detail-description">${escapeHTML(post.description || '추가 설명이 없습니다.')}</p>
      <div class="detail-actions"><button class="button button-outline" type="button" data-share-id="${escapeHTML(post.id)}">공유</button>${ownActions}</div>`;
    detailDialog.showModal();
  }

  function renderMyPost(post) {
    const image = post.imageUrl
      ? `<img class="card-image" src="${escapeHTML(post.imageUrl)}" alt="${escapeHTML(post.title)} 사진" loading="lazy">` : '';
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
      .select('id,user_id,item_type,status,title,description,category,location,item_date,image_url,created_at')
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
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.type];
    const objectPath = `${userId}/${postId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client.storage.from(BUCKET).upload(objectPath, file, {
      cacheControl: '3600', upsert: false, contentType: file.type
    });
    if (error) throw error;
    return { path: objectPath, url: client.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl };
  }

  async function savePost(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!session) return openAuth('login');
    const submitButton = document.querySelector('#submit-post');
    submitButton.disabled = true;
    const file = form.elements.image.files?.[0] || null;
    const previousPost = editingPost;
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
        status: previousPost?.status || 'open'
      };
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
    const submit = document.querySelector('#auth-submit');
    submit.disabled = true;
    const email = authForm.elements.email.value.trim();
    const password = authForm.elements.password.value;
    try {
      if (authMode === 'signup') {
        const displayName = authForm.elements.display_name.value.trim();
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: window.location.href.split('#')[0]
          }
        });
        if (error) throw error;
        authDialog.close();
        authForm.reset();
        if (data.session) showToast('회원가입과 로그인이 완료됐어요.');
        else showToast('인증 이메일을 확인한 뒤 로그인해 주세요.');
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
