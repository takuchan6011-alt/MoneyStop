(() => {
  const STORAGE_KEY = 'emotionSpend:entries';
  const KID_KEY = 'emotionSpend:kidMode';

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const fmtDate = ts => new Date(ts).toLocaleString();
  const fmtJPY = n => `¥${Number(n||0).toLocaleString()}`;
  const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);

  const categoryColors = {
    '食':'#f59e0b','ガジェット':'#22c55e','本':'#38bdf8','服':'#e879f9',
    '遊び':'#f472b6','学び':'#10b981','生活':'#94a3b8','その他':'#eab308'
  };

  let entries = loadEntries();
  let currentFollowId = null;

  // Elements
  const tabs = $$('.tab-btn');
  const sections = {
    'new-entry': $('#section-new-entry'),
    'follow-up': $('#section-follow-up'),
    'history': $('#section-history'),
    'insights': $('#section-insights'),
  };
  const reminderBar = $('#reminderBar');

  // Pre form
  const preForm = $('#preForm');
  const photoInput = $('#photoInput');
  const photoPreview = $('#photoPreview');
  const nameInput = $('#nameInput');
  const priceInput = $('#priceInput');
  const categoryInput = $('#categoryInput');
  const excitementInput = $('#excitementInput');
  const guiltInput = $('#guiltInput');
  const excitementOut = $('#excitementOut');
  const guiltOut = $('#guiltOut');
  const preTagsWrap = $('#preTags');
  const preMemo = $('#preMemo');
  const saveBuyNow = $('#saveBuyNow');
  const saveWait = $('#saveWait');

  // Cooldown
  const cooldownOverlay = $('#cooldownOverlay');
  const cooldownTimer = $('#cooldownTimer');
  const closeCooldown = $('#closeCooldown');

  // Follow-up
  const followList = $('#followList');
  const followDetail = $('#followDetail');
  const followTitle = $('#followTitle');
  const btnBought = $('#btnBought');
  const btnNotBought = $('#btnNotBought');
  const boughtForm = $('#boughtForm');
  const notBoughtForm = $('#notBoughtForm');
  const satisfactionInput = $('#satisfactionInput');
  const regretInput = $('#regretInput');
  const satisfactionOut = $('#satisfactionOut');
  const regretOut = $('#regretOut');
  const reliefInput = $('#reliefInput');
  const longingInput = $('#longingInput');
  const reliefOut = $('#reliefOut');
  const longingOut = $('#longingOut');
  const postTagsBought = $('#postTagsBought');
  const postTagsNotBought = $('#postTagsNotBought');
  const postMemoBought = $('#postMemoBought');
  const postMemoNotBought = $('#postMemoNotBought');
  const saveBought = $('#saveBought');
  const saveNotBought = $('#saveNotBought');

  // History
  const filterCategory = $('#filterCategory');
  const sortOrder = $('#sortOrder');
  const historyList = $('#historyList');

  // Insights
  const yMetric = $('#yMetric');
  const canvas = $('#scatterCanvas');
  const legend = $('#legend');
  const ctx = canvas.getContext('2d');

  // Kid mode
  const kidToggle = $('#kidModeToggle');
  initKidMode();

  // Nav
  tabs.forEach(b=>{
    b.addEventListener('click', ()=>{
      tabs.forEach(t=>t.classList.remove('active'));
      b.classList.add('active');
      const target = b.dataset.target;
      for (const k in sections) sections[k].classList.toggle('active', k===target);
      if (target === 'follow-up') renderFollowList();
      if (target === 'history') renderHistory();
      if (target === 'insights') drawChart();
    });
  });

  // Pre form interactions
  [excitementInput, guiltInput].forEach(inp=>{
    inp.addEventListener('input', ()=>{
      if (inp === excitementInput) excitementOut.value = inp.value;
      if (inp === guiltInput) guiltOut.value = inp.value;
    });
  });

  preTagsWrap.addEventListener('click', e=>{
    const btn = e.target.closest('.chip'); if (!btn) return;
    btn.classList.toggle('active');
  });

  photoInput.addEventListener('change', ()=>{
    const file = photoInput.files && photoInput.files[0];
    if (!file) { photoPreview.classList.add('hidden'); photoPreview.src=''; return; }
    const reader = new FileReader();
    reader.onload = e => { photoPreview.src = e.target.result; photoPreview.classList.remove('hidden'); };
    reader.readAsDataURL(file);
  });

  preForm.addEventListener('submit', e=>{
    e.preventDefault();
    createEntry('buy-now');
  });
  saveWait.addEventListener('click', ()=>{
    createEntry('wait');
  });

  function createEntry(decisionType){
    const name = nameInput.value.trim();
    const price = Number(priceInput.value || 0);
    const category = categoryInput.value;
    if (!name || !price) {
      alert('名前と金額を入力してください'); return;
    }
    const tags = $$('.chip.active', preTagsWrap).map(b=>b.dataset.value);
    const photo = photoPreview && !photoPreview.classList.contains('hidden') ? photoPreview.src : null;
    const now = Date.now();
    const id = uid();
    const entry = {
      id, createdAt: now,
      product: { name, price, category, photo },
      pre: { excitement: Number(excitementInput.value), guilt: Number(guiltInput.value), tags, memo: preMemo.value.trim() },
      decision: { type: decisionType, cooldownUntil: decisionType === 'wait' ? now + 24*60*60*1000 : null },
      outcome: null
    };
    entries.unshift(entry); // newest first
    saveEntries();

    // reset quick
    preForm.reset();
    $$('.chip.active', preTagsWrap).forEach(b=>b.classList.remove('active'));
    photoPreview.classList.add('hidden'); photoPreview.src='';

    if (decisionType === 'wait') {
      openCooldown();
      // Simple notification demo (after ~5s). Real next-day requires SW/Alarms.
      if ('Notification' in window && Notification.permission === 'granted') {
        setTimeout(()=>{
          new Notification('明日のリマインド', { body: '昨日の“あの欲しいやつ”、今の気分で見てもまだ欲しい？' });
        }, 5000);
      }
      // Show reminder bar next app open when time passes
      checkReminders();
    } else {
      // Jump to follow-up immediately
      goTo('follow-up');
    }
  }

  // Cooldown Overlay
  function openCooldown(){
    cooldownOverlay.classList.remove('hidden');
    let t=10;
    cooldownTimer.textContent = String(t);
    const itv = setInterval(()=>{
      t--; cooldownTimer.textContent = String(t);
      if (t<=0){ clearInterval(itv); }
    }, 1000);
  }
  closeCooldown.addEventListener('click', ()=>cooldownOverlay.classList.add('hidden'));

  // Follow-up
  function renderFollowList(){
    const pending = entries.filter(e=>!e.outcome || e.outcome.result==='pending');
    followList.innerHTML = '';
    if (pending.length===0){
      followList.innerHTML = `<p class=\"item-meta\">未フォローの記録はありません。</p>`;
      followDetail.classList.add('hidden');
      return;
    }
    pending.forEach(e=>{
      const div = document.createElement('div');
      div.className = 'history-item';
      const img = document.createElement('img');
      img.className = 'thumb';
      img.src = e.product.photo || '';
      img.alt = '';
      if (!e.product.photo) img.style.opacity = .3;
      const info = document.createElement('div');
      const title = document.createElement('div');
      title.className='item-title';
      title.textContent = e.product.name;
      const meta = document.createElement('div');
      meta.className='item-meta';
      meta.textContent = `${fmtDate(e.createdAt)} / ${e.product.category} / ${fmtJPY(e.product.price)} / ワクワク:${e.pre.excitement} モヤモヤ:${e.pre.guilt}`;
      info.appendChild(title); info.appendChild(meta);
      const act = document.createElement('div');
      const btn = document.createElement('button');
      btn.className='btn'; btn.textContent='開く';
      btn.addEventListener('click', ()=>openFollowDetail(e.id));
      act.appendChild(btn);
      div.appendChild(img); div.appendChild(info); div.appendChild(act);
      followList.appendChild(div);
    });
    followDetail.classList.add('hidden');
  }

  function openFollowDetail(id){
    currentFollowId = id;
    const e = entries.find(x=>x.id===id);
    followTitle.textContent = `「${e.product.name}」の結果`;
    followDetail.classList.remove('hidden');
    boughtForm.classList.add('hidden');
    notBoughtForm.classList.add('hidden');
    postMemoBought.value=''; postMemoNotBought.value='';
    $$('.chip.active', postTagsBought).forEach(b=>b.classList.remove('active'));
    $$('.chip.active', postTagsNotBought).forEach(b=>b.classList.remove('active'));
  }

  btnBought.addEventListener('click', ()=>{
    boughtForm.classList.remove('hidden');
    notBoughtForm.classList.add('hidden');
  });
  btnNotBought.addEventListener('click', ()=>{
    notBoughtForm.classList.remove('hidden');
    boughtForm.classList.add('hidden');
  });

  [satisfactionInput, regretInput, reliefInput, longingInput].forEach(inp=>{
    const m = {satisfactionInput:satisfactionOut, regretInput:regretOut, reliefInput:reliefOut, longingInput:longingOut};
    inp.addEventListener('input', ()=> {
      const out = m[inp.id]; if (out) out.value = inp.value;
    });
  });

  [postTagsBought, postTagsNotBought].forEach(wrap=>{
    wrap.addEventListener('click', e=>{
      const btn = e.target.closest('.chip'); if (!btn) return;
      btn.classList.toggle('active');
    });
  });

  saveBought.addEventListener('click', ()=>{
    if (!currentFollowId) return;
    const e = entries.find(x=>x.id===currentFollowId);
    e.outcome = {
      result:'bought',
      bought:{
        satisfaction:Number(satisfactionInput.value),
        regret:Number(regretInput.value),
        tags:$$('.chip.active', postTagsBought).map(b=>b.dataset.value),
        memo: postMemoBought.value.trim()
      },
      completedAt: Date.now()
    };
    saveEntries();
    renderFollowList();
    renderHistory();
    drawChart();
    alert('保存しました');
  });

  saveNotBought.addEventListener('click', ()=>{
    if (!currentFollowId) return;
    const e = entries.find(x=>x.id===currentFollowId);
    e.outcome = {
      result:'not_bought',
      notBought:{
        relief:Number(reliefInput.value),
        longing:Number(longingInput.value),
        tags:$$('.chip.active', postTagsNotBought).map(b=>b.dataset.value),
        memo: postMemoNotBought.value.trim()
      },
      completedAt: Date.now()
    };
    saveEntries();
    renderFollowList();
    renderHistory();
    drawChart();
    alert('保存しました');
  });

  // History
  function renderHistory(){
    const cat = filterCategory.value;
    const order = sortOrder.value;
    let list = entries.slice();
    if (cat) list = list.filter(e=>e.product.category===cat);
    list.sort((a,b)=>{
      if (order==='new') return b.createdAt - a.createdAt;
      if (order==='old') return a.createdAt - b.createdAt;
      if (order==='price_desc') return b.product.price - a.product.price;
      if (order==='price_asc') return a.product.price - b.product.price;
      return 0;
    });
    historyList.innerHTML = '';
    if (list.length===0){
      historyList.innerHTML = `<p class=\"item-meta\">記録がありません。</p>`;
      return;
    }
    list.forEach(e=>{
      const row = document.createElement('div'); row.className='history-item';
      const img = document.createElement('img'); img.className='thumb'; img.src=e.product.photo||''; img.alt='';
      if (!e.product.photo) img.style.opacity=.3;
      const info = document.createElement('div');
      const title = document.createElement('div'); title.className='item-title'; title.textContent = e.product.name;
      const meta = document.createElement('div'); meta.className='item-meta';
      meta.textContent = `${fmtDate(e.createdAt)} / ${e.product.category} / ${fmtJPY(e.product.price)} / 事前:ワクワク${e.pre.excitement} モヤモヤ${e.pre.guilt}`;
      info.appendChild(title); info.appendChild(meta);
      const right = document.createElement('div'); right.className='badges';
      if (e.outcome?.result==='bought'){
        right.appendChild(badge(`満足 ${e.outcome.bought.satisfaction}`, 'ok'));
        const cl = e.outcome.bought.regret>=7?'danger': e.outcome.bought.regret>=3?'warn':'';
        right.appendChild(badge(`後悔 ${e.outcome.bought.regret}`, cl));
      } else if (e.outcome?.result==='not_bought'){
        right.appendChild(badge(`スッキリ ${e.outcome.notBought.relief}`, 'ok'));
        const cl = e.outcome.notBought.longing>=7?'warn':'';
        right.appendChild(badge(`未練 ${e.outcome.notBought.longing}`, cl));
      } else {
        const b = document.createElement('button');
        b.className='btn'; b.textContent='フォローアップ';
        b.addEventListener('click', ()=>{ goTo('follow-up'); openFollowDetail(e.id); });
        right.appendChild(b);
      }
      row.appendChild(img); row.appendChild(info); row.appendChild(right);
      historyList.appendChild(row);
    });
  }
  filterCategory.addEventListener('change', renderHistory);
  sortOrder.addEventListener('change', renderHistory);

  function badge(text, cls){ const s = document.createElement('span'); s.className = `badge ${cls||''}`; s.textContent=text; return s; }

  // Insights Chart
  function drawChart(){
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    // axes
    const padL=50, padB=40, padT=10, padR=10;
    ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, H-padB); ctx.lineTo(W-padR, H-padB); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.6)';
    ctx.font='12px Inter';

    // y ticks 0..10
    for(let i=0;i<=10;i+=2){
      const y = mapY(i);
      ctx.fillText(String(i), 8, y+4);
      ctx.strokeStyle='rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W-padR, y); ctx.stroke();
    }
    ctx.fillText('満足/スッキリ', 8, padT+10);
    ctx.fillText('金額', W-48, H-8);

    const completed = entries.filter(e=>e.outcome && e.outcome.result!=='pending');
    if (completed.length===0){ ctx.fillText('データがありません。', padL+10, (H-padB)/2); legend.innerHTML=''; return; }

    const maxPrice = Math.max( 1000, ...completed.map(e=>e.product.price) );
    function mapX(price){ return padL + (W-padL-padR) * (price / maxPrice); }
    function mapY(v){ return padT + (H-padT-padB) * (1 - v/10); }

    // points
    completed.forEach(e=>{
      let yv = 0;
      if (yMetric.value==='satisfaction') yv = e.outcome.result==='bought' ? e.outcome.bought.satisfaction : null;
      else if (yMetric.value==='relief') yv = e.outcome.result==='not_bought' ? e.outcome.notBought.relief : null;
      else { // auto
        yv = e.outcome.result==='bought' ? e.outcome.bought.satisfaction : e.outcome.notBought?.relief;
      }
      if (yv==null) return;
      const x = mapX(e.product.price);
      const y = mapY(yv);
      const col = categoryColors[e.product.category] || '#e5e7eb';
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2); ctx.fill();

      // tiny outline for visibility
      ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(x,y,5.5,0,Math.PI*2); ctx.stroke();
    });

    // legend
    legend.innerHTML = '';
    Object.entries(categoryColors).forEach(([cat,col])=>{
      const wrap = document.createElement('div'); wrap.className='key';
      const dot = document.createElement('div'); dot.className='dot'; dot.style.background = col;
      const label = document.createElement('span'); label.textContent = cat;
      wrap.appendChild(dot); wrap.appendChild(label); legend.appendChild(wrap);
    });
  }
  yMetric.addEventListener('change', drawChart);

  // Reminders: show banner when any wait cooldown passed
  function checkReminders(){
    const now = Date.now();
    const pending = entries.filter(e => e.decision?.type==='wait' && e.decision.cooldownUntil && e.decision.cooldownUntil <= now && (!e.outcome || e.outcome.result==='pending'));
    if (pending.length>0){
      reminderBar.classList.remove('hidden');
      reminderBar.innerHTML = `<span>昨日の“あの欲しいやつ”、今の気分で見てもまだ欲しい？</span><button class=\"btn\" id=\"openFU\">開く</button>`;
      $('#openFU').addEventListener('click', ()=>{ goTo('follow-up'); });
    } else {
      reminderBar.classList.add('hidden');
    }
  }

  // Navigation helper
  function goTo(section){
    tabs.forEach(t=>t.classList.toggle('active', t.dataset.target===section));
    for (const k in sections) sections[k].classList.toggle('active', k===section);
    if (section==='follow-up') renderFollowList();
    if (section==='history') renderHistory();
    if (section==='insights') drawChart();
  }

  // Storage
  function loadEntries(){
    try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); }catch{ return []; }
  }
  function saveEntries(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  // Kid mode
  function initKidMode(){
    const on = localStorage.getItem(KID_KEY)==='1';
    if (on) document.body.classList.add('kid-mode');
    kidToggle.checked = on;
    applyKidLabels(on);
    kidToggle.addEventListener('change', ()=>{
      document.body.classList.toggle('kid-mode', kidToggle.checked);
      localStorage.setItem(KID_KEY, kidToggle.checked?'1':'0');
      applyKidLabels(kidToggle.checked);
    });
  }
  function applyKidLabels(on){
    $('#labelExcitement').textContent = on ? 'ワクワク' : 'ワクワク度';
    $('#labelGuilt').textContent = on ? 'モヤモヤ' : '不安・罪悪感度';
  }

  // Initial render
  renderHistory();
  renderFollowList();
  drawChart();
  checkReminders();
})();

