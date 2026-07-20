/* ================================================================
   LEADERBOARD.JS — Kalıcı, tüm cihazlarda tutarlı liderlik tablosu
   (Splash / giriş ekranının altında sabit, tıklama gerektirmez)
   ================================================================

   TEK YAPMAN GEREKEN ADIM (daha önce yapmadıysan):
   Bu tablo tüm ziyaretçiler arasında GERÇEKTEN paylaşılan/kalıcı olsun
   diye ücretsiz bir Firebase (Google) veritabanı kullanıyor.

   1) https://console.firebase.google.com > projenin var (Mhamzac).
   2) Realtime Database zaten oluşturuldu ve Rules'a
      { "rules": { "leaderboard": { ".read": true, ".write": true } } }
      yapıştırıldı.
   3) Project settings > Your apps > Web (</>) ile alınan 7 değeri
      aşağıdaki FIREBASE_CONFIG içine yapıştır.
================================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBHgCtHuIunwlleLCxFCexErrjyZkuNYE0",
  authDomain: "mhamzac-ca73d.firebaseapp.com",
  databaseURL: "https://mhamzac-ca73d-default-rtdb.firebaseio.com",
  projectId: "mhamzac-ca73d",
  storageBucket: "mhamzac-ca73d.firebasestorage.app",
  messagingSenderId: "1002199445271",
  appId: "1:1002199445271:web:2c6620ff1db498c4679152"
};

function initLeaderboard(){
  try{
    const isConfigured = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('BURAYA_YAPISTIR') === -1;
    let db = null;

    if(isConfigured && typeof firebase !== 'undefined'){
      try{
        firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.database();
      }catch(e){ console.warn('Firebase başlatılamadı:', e); }
    } else if(!isConfigured){
      console.warn('Liderlik tablosu: FIREBASE_CONFIG henüz doldurulmadı.');
    } else {
      console.warn('Liderlik tablosu: Firebase SDK yüklenemedi (script src hatası olabilir).');
    }

    /* ---------------- İSİM YÖNETİMİ ---------------- */
    const NAME_KEY = 'lb_user_name';
    function getStoredName(){ try{ return localStorage.getItem(NAME_KEY) || ''; }catch(e){ return ''; } }
    function setStoredName(n){ try{ localStorage.setItem(NAME_KEY, n); }catch(e){} }
    function sanitizeKey(name){
      // Aynı kişi ismini farklı büyük/küçük harf veya fazladan boşlukla yazsa bile
      // HER ZAMAN aynı veritabanı anahtarına düşsün diye normalize ediyoruz.
      // Aksi halde "Ali" ve "ali " iki farklı kişi gibi kaydolur ve süre bölünür.
      return name.trim().toLowerCase().replace(/\s+/g, '_').slice(0,20).replace(/[.#$/\[\]]/g, '_');
    }

    const nameOverlay = document.getElementById('nameOverlay');
    const nameInput = document.getElementById('nameInput');
    const nameSubmit = document.getElementById('nameSubmit');

    function showNameModal(){ if(nameOverlay) nameOverlay.classList.add('open'); }
    function hideNameModal(){ if(nameOverlay) nameOverlay.classList.remove('open'); }

    if(nameSubmit && nameInput){
      nameSubmit.onclick = () => {
        const name = nameInput.value.trim();
        if(!name){ nameInput.focus(); return; }
        setStoredName(name);
        hideNameModal();
        startTracking(name);
      };
      nameInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') nameSubmit.click();
      });
    } else {
      console.warn('Liderlik tablosu: isim formu elementleri bulunamadı.');
    }

    /* ---------------- SÜRE TAKİBİ (aktiflik bazlı, hile önleyici) ---------------- */
    let currentName = '';
    let heartbeatTimer = null;
    let creditedSeconds = 0;     // veritabanına şu ana kadar yazılan aktif süre
    let activeAccumulated = 0;   // bu oturumda BİRİKEN gerçek aktif süre (hareketsizlik hariç)
    let lastActivity = Date.now();
    let lastTick = Date.now();
    const FLUSH_MS = 5000;       // her 5 saniyede bir eşitle
    const IDLE_MS = 10000;       // 10 saniye hareketsizlik = duraklat

    // Herhangi bir dokunma, tıklama, kaydırma veya tuş basımı "aktiflik" sayılır.
    const ACTIVITY_EVENTS = ['click','touchstart','touchmove','mousemove','keydown','scroll','pointerdown'];
    ACTIVITY_EVENTS.forEach(evt => {
      window.addEventListener(evt, () => { lastActivity = Date.now(); }, { passive:true });
    });

    // Her saniye çalışır: son 10 saniye içinde bir hareket olduysa geçen süreyi
    // aktif süreye ekler; hareketsizlik 10 saniyeyi geçtiyse sayaç OLDUĞU YERDE
    // durur (hem ekrandaki sayaç hem liderlik tablosu için). Kullanıcı tekrar
    // dokunduğu an sayaç kaldığı yerden devam eder.
    function tickActive(){
      const now = Date.now();
      const idleFor = now - lastActivity;
      if(idleFor < IDLE_MS){
        activeAccumulated += (now - lastTick) / 1000;
      }
      lastTick = now;
    }
    setInterval(tickActive, 1000);

    function isIdleNow(){
      return (Date.now() - lastActivity) >= IDLE_MS;
    }

    function startTracking(name){
      currentName = name;
      if(!db) return;
      if(heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(flushElapsed, FLUSH_MS);
    }

    // Zamanlayıcılar gecikse/atlasa bile (arka plana atma, ekran kilidi vb.),
    // her çağrıda birikmiş AKTİF süre ile veritabanına yazılan miktar
    // karşılaştırılıp aradaki fark tek seferde işlenir. Hareketsiz geçen
    // süre bu birikimin dışında kaldığı için asla ödüllendirilmez.
    function flushElapsed(useBeacon){
      tickActive();
      if(!currentName) return;
      const delta = activeAccumulated - creditedSeconds;
      if(delta >= 0.5){
        addSeconds(currentName, delta, useBeacon);
        creditedSeconds = activeAccumulated;
      }
    }

    function addSeconds(name, seconds, useBeacon){
      if(!name) return;
      const key = sanitizeKey(name);
      if(!key) return;
      // Sayfa kapanırken (pagehide/beforeunload) normal Firebase yazma işlemi
      // bazen tamamlanmadan sayfa sonlanabilir. Bu durumda "keepalive" özellikli
      // ham bir istekle son anda yazmayı garantiye almaya çalışıyoruz.
      if(useBeacon && FIREBASE_CONFIG.databaseURL && FIREBASE_CONFIG.databaseURL.indexOf('BURAYA_YAPISTIR') === -1){
        try{
          const url = FIREBASE_CONFIG.databaseURL.replace(/\/$/, '') + '/leaderboard/' + key + '/lastFlushAttempt.json';
          fetch(url, { method:'PUT', body: JSON.stringify(Date.now()), keepalive:true }).catch(()=>{});
        }catch(e){}
      }
      if(!db) return;
      const ref = db.ref('leaderboard/' + key);
      ref.transaction((current) => {
        const prev = current && typeof current === 'object' ? current : { name: name, totalSeconds: 0 };
        return { name: name, totalSeconds: (prev.totalSeconds || 0) + seconds, lastSeen: Date.now() };
      });
    }

    document.addEventListener('visibilitychange', () => {
      // Sekme tekrar görünür olduğunda ya da gizlendiğinde, aradaki gerçek
      // süreyi hemen veritabanına işle (arka planda geçen süre de dahil).
      // NOT: Telefon uzun süre kilitli kalıp tarayıcı sekmeyi tamamen
      // sonlandırırsa (işletim sisteminin bellek/pil tasarrufu davranışı),
      // o sırada hiçbir JavaScript çalışamayacağı için o boşluk kaydedilemez —
      // bu, web sitelerinin aşamayacağı bir platform kısıtlamasıdır.
      if(document.visibilityState === 'hidden'){
        flushElapsed(true);
      } else {
        flushElapsed();
      }
    });
    window.addEventListener('beforeunload', () => flushElapsed(true));
    window.addEventListener('pagehide', () => flushElapsed(true));

    /* ---------------- LİDERLİK TABLOSU GÖRÜNÜMÜ (splash içinde sabit) ---------------- */
    function fmtTime(totalSeconds){
      const s = Math.max(0, Math.floor(totalSeconds || 0));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      if(h > 0) return `${h}s ${m}dk`;
      if(m > 0) return `${m}dk`;
      return `${s}sn`;
    }

    function escapeHtml(s){
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    const MEDALS = ['🥇','🥈','🥉'];
    function renderLeaderboard(entries){
      const list = document.getElementById('splashLbList');
      if(!list) return;
      if(!db){
        list.innerHTML = '<div class="lb-empty">Tablo henüz bağlanmadı.</div>';
        return;
      }
      if(!entries.length){
        list.innerHTML = '<div class="lb-empty">Henüz kimse yok. İlk sen ol! 🎉</div>';
        return;
      }
      list.innerHTML = '';
      entries.forEach((e, i) => {
        const row = document.createElement('div');
        row.className = 'lb-row' + (e.name === currentName ? ' me' : '');
        const rankDisplay = MEDALS[i] || (i+1);
        row.innerHTML = `
          <div class="lb-rank">${rankDisplay}</div>
          <div class="lb-name">${escapeHtml(e.name)}${e.name===currentName ? ' (sen)' : ''}</div>
          <div class="lb-time">${fmtTime(e.totalSeconds)}</div>`;
        list.appendChild(row);
      });
    }

    function listenLeaderboard(){
      if(!db){ renderLeaderboard([]); return; }
      db.ref('leaderboard').on('value', (snap) => {
        const val = snap.val() || {};
        const entries = Object.values(val)
          .filter(v => v && v.name)
          .sort((a,b) => (b.totalSeconds||0) - (a.totalSeconds||0))
          .slice(0, 5);
        renderLeaderboard(entries);
      }, (err) => {
        console.warn('Liderlik verisi okunamadı:', err);
        renderLeaderboard([]);
      });
    }

    /* ---------------- BAŞLAT ---------------- */
    listenLeaderboard();

    const existing = getStoredName();
    if(existing){
      startTracking(existing);
    }

    // Ana script (splash tıklamasını zaten yönetiyor) bu fonksiyonu çağırarak
    // ismi henüz kayıtlı değilse modalı güvenilir şekilde açar.
    window.LB_checkName = function(){
      if(!getStoredName()){
        showNameModal();
      }
    };
    window.LB_startTracking = startTracking;
    window.LB_getActiveSeconds = () => activeAccumulated;
    window.LB_isIdle = isIdleNow;
  }catch(err){
    console.error('Liderlik tablosu başlatılırken hata oluştu:', err);
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initLeaderboard);
} else {
  initLeaderboard();
}
