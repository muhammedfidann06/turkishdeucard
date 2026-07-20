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
    function sanitizeKey(name){ return name.trim().slice(0,20).replace(/[.#$/\[\]]/g, '_'); }

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

    /* ---------------- SÜRE TAKİBİ (kalıcı, gerçek zamana dayalı, kayıpsız) ---------------- */
    let currentName = '';
    let heartbeatTimer = null;
    let sessionStart = 0;      // bu oturumun başladığı an
    let creditedSeconds = 0;   // bu oturumdan şu ana kadar veritabanına yazılan süre
    const FLUSH_MS = 5000;     // her 5 saniyede bir gerçek süreyi eşitle

    function startTracking(name){
      currentName = name;
      if(!db) return;
      if(!sessionStart) sessionStart = Date.now();
      if(heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(flushElapsed, FLUSH_MS);
    }

    // Ekranın arka plana atılması, kilitlenmesi veya sekmenin askıya alınması
    // yüzünden zamanlayıcılar gecikse/atlasa bile, her çağrıda "şu ana kadar
    // GERÇEKTE ne kadar süre geçti" hesaplanıp aradaki fark tek seferde
    // veritabanına yazılır. Böylece hiçbir saniye kaybolmaz ve ekrandaki
    // sayaçla liderlik tablosu birbiriyle her zaman tutarlı kalır.
    function flushElapsed(){
      if(!db || !currentName || !sessionStart) return;
      const totalElapsed = (Date.now() - sessionStart) / 1000;
      const delta = totalElapsed - creditedSeconds;
      if(delta >= 1){
        addSeconds(currentName, delta);
        creditedSeconds = totalElapsed;
      }
    }

    function addSeconds(name, seconds){
      if(!db || !name) return;
      const key = sanitizeKey(name);
      if(!key) return;
      const ref = db.ref('leaderboard/' + key);
      ref.transaction((current) => {
        const prev = current && typeof current === 'object' ? current : { name: name, totalSeconds: 0 };
        return { name: name, totalSeconds: (prev.totalSeconds || 0) + seconds, lastSeen: Date.now() };
      });
    }

    document.addEventListener('visibilitychange', () => {
      // Sekme tekrar görünür olduğunda ya da gizlendiğinde, aradaki gerçek
      // süreyi hemen veritabanına işle (arka planda geçen süre de dahil).
      flushElapsed();
    });
    window.addEventListener('beforeunload', flushElapsed);
    window.addEventListener('pagehide', flushElapsed);

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
        row.innerHTML = `
          <div class="lb-rank">${i+1}</div>
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
          .slice(0, 3);
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
  }catch(err){
    console.error('Liderlik tablosu başlatılırken hata oluştu:', err);
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initLeaderboard);
} else {
  initLeaderboard();
}
