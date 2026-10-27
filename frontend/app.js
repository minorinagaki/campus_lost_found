(() => {
  'use strict';

  const samplePosts = [
    { id: 'sample-1', type: 'found', title: '투명 우산', kind: '의류·잡화', date: '2026-10-27', place: '학생회관 앞', description: '입구 오른쪽 벤치 옆에 놓여 있었어요. 손잡이에 작은 흠집이 있어요.' },
    { id: 'sample-2', type: 'lost', title: '검정색 카드지갑', kind: '지갑·카드', date: '2026-10-26', place: '중앙도서관 2층', description: '열람실에서 카페로 이동하는 길에 잃어버린 것 같아요. 안쪽에 초록색 카드가 있어요.' },
    { id: 'sample-3', type: 'found', title: '무선 이어폰 케이스', kind: '전자기기', date: '2026-10-26', place: '인문관 1층 로비', description: '회색 케이스예요. 안내 데스크에 맡겨두었어요.' },
    { id: 'sample-4', type: 'lost', title: '노란색 필통', kind: '문구·책', date: '2026-10-25', place: '학생식당', description: '작은 별 모양 스티커가 붙어 있어요. 창가 쪽 자리에 두고 왔어요.' },
    { id: 'sample-5', type: 'found', title: '은색 열쇠 꾸러미', kind: '열쇠', date: '2026-10-25', place: '체육관 입구', description: '파란색 고무 키링이 달려 있어요. 체육관 안내실에 전달했어요.' },
    { id: 'sample-6', type: 'lost', title: '회색 니트 장갑 한 짝', kind: '의류·잡화', date: '2026-10-24', place: '정문 버스 정류장', description: '엄지 부분에 작은 자수 무늬가 있어요. 정류장 의자 근처에서 놓친 것 같아요.' },
    { id: 'sample-7', type: 'found', title: '파란색 텀블러', kind: '가방·소지품', date: '2026-10-23', place: '과학관 3층', description: '실험실 앞 복도에서 발견했어요. 뚜껑에 흰색 스티커가 붙어 있어요.' },
    { id: 'sample-8', type: 'lost', title: '전공 서적', kind: '문구·책', date: '2026-10-22', place: '학생회관 앞', description: '벤치에 잠시 두었다가 잊은 것 같아요. 책 안쪽에 메모지가 들어 있어요.' }
  ];
  // 데모 등록 데이터는 이 배열에만 보관하며, 새로고침하면 샘플로 돌아갑니다.
  let posts = [...samplePosts];
  let activeFormType = 'lost';
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

  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function prettyDate(isoDate) {
    const [year, month, day] = isoDate.split('-').map(Number);
    return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
  }

  function refreshOptions(select, key, label) {
    const previous = select.value;
    const options = [...new Set(posts.map((post) => post[key]))].sort((a, b) => a.localeCompare(b, 'ko'));
    select.innerHTML = `<option value="all">전체 ${label}</option>` + options.map((option) =>
      `<option value="${escapeHTML(option)}">${escapeHTML(option)}</option>`).join('');
    if (options.includes(previous)) select.value = previous;
  }

  function getFilteredPosts() {
    const term = keyword.value.trim().toLocaleLowerCase('ko');
    const type = document.querySelector('input[name="post-type"]:checked').value;
    return posts.filter((post) => {
      const matchesTerm = !term || [post.title, post.description, post.place, post.kind].some((part) => part.toLocaleLowerCase('ko').includes(term));
      return matchesTerm && (kindFilter.value === 'all' || post.kind === kindFilter.value) &&
        (placeFilter.value === 'all' || post.place === placeFilter.value) && (type === 'all' || post.type === type);
    });
  }

  function render() {
    refreshOptions(kindFilter, 'kind', '종류');
    refreshOptions(placeFilter, 'place', '장소');
    const filtered = getFilteredPosts();
    totalCount.textContent = posts.length;
    resultSummary.innerHTML = `전체 <strong>${filtered.length}</strong>개의 소식이 있어요.`;
    list.innerHTML = filtered.map((post) => {
      const typeName = post.type === 'lost' ? '분실' : '습득';
      const typeLabel = post.type === 'lost' ? 'LOST' : 'FOUND';
      const shareLabel = `${typeName} 소식 공유: ${post.title}`;
      return `<article class="post-card">
        <div class="card-top"><div class="card-badges"><span class="type-badge ${post.type}">${typeLabel} · ${typeName}</span><span class="kind-badge">${escapeHTML(post.kind)}</span></div><time class="card-date" datetime="${escapeHTML(post.date)}">${prettyDate(post.date)}</time></div>
        <h3 class="card-title">${escapeHTML(post.title)}</h3><p class="card-description">${escapeHTML(post.description || '자세한 특징은 등록한 분이 남긴 소식을 확인해 주세요.')}</p>
        <div class="card-meta"><span class="meta-dot" aria-hidden="true">⌖</span><span class="meta-place">${escapeHTML(post.place)}</span><button type="button" class="share-button" data-share-id="${escapeHTML(post.id)}" aria-label="${escapeHTML(shareLabel)}"><span aria-hidden="true">↗</span> 공유</button></div>
      </article>`;
    }).join('');
    emptyState.hidden = filtered.length !== 0;
    list.hidden = filtered.length === 0;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3300);
  }

  function resetFilters() {
    keyword.value = '';
    kindFilter.value = 'all';
    placeFilter.value = 'all';
    document.querySelector('input[name="post-type"][value="all"]').checked = true;
    render();
  }

  function openForm(type) {
    setFormType(type);
    formSection.hidden = false;
    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelector('[name="title"]').focus({ preventScroll: true });
  }

  function setFormType(type) {
    activeFormType = type;
    const found = type === 'found';
    document.querySelector('#form-title').textContent = found ? '습득 소식 남기기.' : '분실 소식 남기기.';
    document.querySelector('#form-intro').textContent = found ? '주인을 기다리는 물건의 정보를 적어주세요.' : '잃어버린 물건을 알아볼 수 있게 적어주세요.';
    document.querySelectorAll('[data-form-type]').forEach((button) => {
      const selected = button.dataset.formType === type;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function makeShareText(post) {
    const label = post.type === 'lost' ? '분실' : '습득';
    return `[교내 분실물 소식 · ${label}] ${post.title}\n종류: ${post.kind}\n장소: ${post.place}\n날짜: ${prettyDate(post.date)}\n${post.description ? `${post.description}\n` : ''}다시, 제자리 — 어떻게 찾을까, 어떻게 알릴까?`;
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
      } catch (_) {
        // 공유가 취소되거나 실패하면 복사로 이어집니다.
      }
    }
    try {
      await copyText(text);
      showToast('소식 내용을 클립보드에 복사했어요.');
    } catch (_) {
      showToast('복사할 수 없어요. 브라우저의 클립보드 권한을 확인해 주세요.');
    }
  }

  document.querySelectorAll('[data-open-form]').forEach((button) => button.addEventListener('click', () => openForm(button.dataset.openForm)));
  document.querySelectorAll('[data-form-type]').forEach((button) => button.addEventListener('click', () => setFormType(button.dataset.formType)));
  [keyword, kindFilter, placeFilter].forEach((control) => control.addEventListener(control === keyword ? 'input' : 'change', render));
  document.querySelectorAll('input[name="post-type"]').forEach((radio) => radio.addEventListener('change', render));
  document.querySelector('#reset-filters').addEventListener('click', resetFilters);
  document.querySelector('#empty-reset').addEventListener('click', resetFilters);
  document.querySelector('#close-form').addEventListener('click', () => { formSection.hidden = true; });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-share-id]');
    if (!button) return;
    const post = posts.find((item) => item.id === button.dataset.shareId);
    if (post) sharePost(post);
  });
  document.querySelector('[name="description"]').addEventListener('input', (event) => {
    document.querySelector('#char-count').textContent = event.target.value.length;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const post = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: activeFormType,
      title: String(data.get('title')).trim(),
      kind: String(data.get('kind')),
      date: String(data.get('date')),
      place: String(data.get('place')).trim(),
      description: String(data.get('description') || '').trim()
    };
    posts.unshift(post);
    resetFilters();
    form.reset();
    dateField.value = todayISO();
    document.querySelector('#char-count').textContent = '0';
    formSection.hidden = true;
    document.querySelector('#find').scrollIntoView({ behavior: 'smooth' });
    showToast('소식을 등록했어요. 이 화면에서만 볼 수 있어요.');
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      keyword.focus();
      document.querySelector('#find').scrollIntoView({ behavior: 'smooth' });
    }
    if (event.key === 'Escape' && !formSection.hidden) formSection.hidden = true;
  });

  const dateField = document.querySelector('[name="date"]');
  function todayISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  dateField.value = todayISO();
  render();
})();
