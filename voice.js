/* ============================================================================
   voice.js — Seslendirme motoru

   Bu dosya index.html'deki ses mantığını YENİDEN YAZMAZ; sadece kalitenin
   belirlendiği iki fonksiyonu devralır:

       pickVoice()   → hangi ses kullanılacak
       speakNative() → nasıl konuşulacak

   speak() / speakSlow() / soundOn / Google TTS yedeği olduğu gibi kalır,
   dolayısıyla ses açma-kapama ve yedek sistem aynen çalışmaya devam eder.

   ── ESKİ SİSTEMDEKİ SORUNLAR ────────────────────────────────────────────
   1. Ses seçimi "anahtar kelime listesinde ilk eşleşen" mantığıyla yapılıyordu.
      Listede "Pro" gibi kısa parçalar vardı ve alakasız isimlere de takılıyordu.
   2. Apple'ın kalite işareti olan voiceURI (…premium…/…compact…) hiç
      okunmuyordu. Sonuç: iPhone'da çoğu zaman düşük kaliteli "compact" ses.
   3. Bölge tercihi yoktu; Almanca için de-AT, İspanyolca için es-AR gelebiliyordu.
   4. Sesler henüz yüklenmemişken (Chrome'da asenkron gelir) seçim null dönüyor,
      tarayıcı varsayılan sesi kullanıyordu.
   5. cancel() hemen ardından speak() çağrılıyordu — Chrome'da bilinen bir
      yarış durumu, cümlenin sessizce düşmesine yol açar.
   6. Hızlı kart geçişinde her tıklama öncekini kelimenin ortasında kesiyordu.
   ========================================================================== */
(function () {
  'use strict';

  if (!('speechSynthesis' in window)) return;
  var synth = window.speechSynthesis;

  /* ======================================================================
     1 · SES KALİTESİ PUANLAMASI
     Öncelik sırası (yüksek puan = önce seçilir):
        1. Nöral / Natural / Neural motorlar        (en gerçekçi)
        2. Apple "premium" ve "enhanced" paketleri
        3. Siri sesleri
        4. Dile özel, elle seçilmiş kaliteli isimler
        5. Google / Microsoft standart sesleri
        6. Geri kalan her şey
       ── ceza ──
        · "compact" (Apple'ın sıkıştırılmış, metalik sesleri)
        · eSpeak / Pico / Eloquence gibi eski motorlar
     ==================================================================== */

  var NAME_RULES = [
    [/\bneural\b|\(natural\)|\bnatural\b/i, 120],
    [/\bwavenet\b|\bstudio\b|\bjourney\b|\bpolyglot\b/i, 115],
    [/\bpremium\b/i, 100],
    [/\benhanced\b/i, 92],
    [/siri/i, 80],
    [/\bgoogle\b/i, 46],
    [/\bmicrosoft\b/i, 34],
    [/compact/i, -90],
    [/espeak|\bpico\b|eloquence|\bcompact\b/i, -110]
  ];

  /* voiceURI, isimden daha güvenilir bir kalite kaynağıdır.
     Apple örnekleri:
       com.apple.voice.premium.de-DE.Petra      → premium
       com.apple.voice.enhanced.en-US.Ava       → enhanced
       com.apple.ttsbundle.Samantha-compact     → compact (düşük kalite) */
  var URI_RULES = [
    [/voice\.premium/i, 110],
    [/voice\.enhanced/i, 95],
    [/\.neural|neural$/i, 100],
    [/-compact|\.compact/i, -100]
  ];

  /* Dile göre elle seçilmiş sesler ve bölge tercihi.
     Sıra önemlidir: baştaki isim daha yüksek puan alır. */
  var PREFERRED = {
    de: { regions: ['de-de', 'de-at', 'de-ch'],
          names: ['Anna', 'Petra', 'Katja', 'Amala', 'Seraphina', 'Conrad', 'Markus', 'Helena', 'Viktoria'] },
    en: { regions: ['en-us', 'en-gb', 'en-au', 'en-ca'],
          names: ['Ava', 'Samantha', 'Evan', 'Aria', 'Jenny', 'Serena', 'Daniel', 'Kate', 'Karen', 'Moira', 'Allison'] },
    fr: { regions: ['fr-fr', 'fr-ca', 'fr-ch'],
          names: ['Thomas', 'Amélie', 'Amelie', 'Audrey', 'Aurélie', 'Aurelie', 'Denise', 'Henri', 'Marie', 'Nicolas'] },
    es: { regions: ['es-es', 'es-mx', 'es-us', 'es-ar'],
          names: ['Mónica', 'Monica', 'Elvira', 'Alvaro', 'Álvaro', 'Paulina', 'Lucia', 'Jorge', 'Marisol'] },
    ru: { regions: ['ru-ru'],
          names: ['Milena', 'Svetlana', 'Dmitri', 'Dmitry', 'Yuri', 'Katya'] },
    ar: { regions: ['ar-sa', 'ar-001', 'ar-eg', 'ar-ae'],
          names: ['Maged', 'Tarik', 'Laila', 'Zariyah', 'Hamed', 'Salma'] },
    tr: { regions: ['tr-tr'], names: ['Yelda', 'Emel', 'Ahmet'] }
  };

  function scoreVoice(v, wantLang) {
    var s = 0;
    var name = v.name || '';
    var uri = v.voiceURI || '';
    var lang = (v.lang || '').toLowerCase().replace('_', '-');
    var prefix = wantLang.split('-')[0];

    for (var i = 0; i < NAME_RULES.length; i++) {
      if (NAME_RULES[i][0].test(name)) s += NAME_RULES[i][1];
    }
    for (var j = 0; j < URI_RULES.length; j++) {
      if (URI_RULES[j][0].test(uri)) s += URI_RULES[j][1];
    }

    var pref = PREFERRED[prefix];
    if (pref) {
      /* bölge tercihi: listenin başındaki bölge en yüksek puanı alır */
      var ri = pref.regions.indexOf(lang);
      if (ri === 0) s += 60;
      else if (ri > 0) s += 40 - ri * 8;
      else if (lang === wantLang.toLowerCase()) s += 55;

      /* elle seçilmiş isimler */
      for (var k = 0; k < pref.names.length; k++) {
        var n = pref.names[k];
        if (name.toLowerCase().indexOf(n.toLowerCase()) !== -1) {
          s += 70 - k * 4;
          break;
        }
      }
    } else if (lang === wantLang.toLowerCase()) {
      s += 55;
    }

    /* Ağ üzerinden gelen sesler genelde nöral motorlardır; küçük avantaj.
       Bağlantı yoksa zaten zaman aşımıyla yedek sisteme düşülür. */
    if (v.localService === false) s += 12;
    if (v.default) s += 4;

    return s;
  }

  /* ======================================================================
     2 · SES LİSTESİ (asenkron gelebilir)
     ==================================================================== */
  var voices = [];
  var chosen = {};          // dil → ses (önbellek)
  var voicesReady = false;

  function refresh() {
    var list = [];
    try { list = synth.getVoices() || []; } catch (e) { list = []; }
    if (list.length) {
      voices = list;
      voicesReady = true;
      chosen = {};          // liste değişti → seçimleri yeniden hesapla
    }
  }
  refresh();
  synth.addEventListener
    ? synth.addEventListener('voiceschanged', refresh)
    : (synth.onvoiceschanged = refresh);

  /* Sesler henüz gelmediyse kısa süre bekle, sonra yine de devam et.
     Beklemezsek tarayıcı gelişigüzel bir varsayılan sesle konuşur. */
  function withVoices(cb) {
    if (voicesReady) { cb(); return; }
    refresh();
    if (voicesReady) { cb(); return; }
    var tries = 0;
    var timer = setInterval(function () {
      refresh();
      if (voicesReady || ++tries > 12) {   // en fazla ~900ms
        clearInterval(timer);
        cb();
      }
    }, 75);
  }

  function pickVoice(langCode) {
    var want = String(langCode || '').toLowerCase().replace('_', '-');
    if (!want) return null;
    if (chosen[want] !== undefined) return chosen[want];

    var prefix = want.split('-')[0];
    var pool = voices.filter(function (v) {
      return v.lang && v.lang.toLowerCase().replace('_', '-').indexOf(prefix) === 0;
    });
    if (!pool.length) { chosen[want] = null; return null; }

    var best = null, bestScore = -1e9;
    for (var i = 0; i < pool.length; i++) {
      var sc = scoreVoice(pool[i], want);
      if (sc > bestScore) { bestScore = sc; best = pool[i]; }
    }
    chosen[want] = best;
    return best;
  }

  /* ======================================================================
     3 · DİLE GÖRE KONUŞMA HIZI
     Her motor aynı "1.0" hızını aynı tempoda okumaz. Arapça ve Rusça
     sesler belirgin şekilde hızlı; Almanca ve Fransızca daha dengeli.
     Kelime öğrenirken amaç anlaşılırlık olduğu için hepsi hafifçe
     yavaşlatılır ama "robot" tonuna düşecek kadar değil.
     ==================================================================== */
  var RATE = {
    de: 0.94, en: 0.95, fr: 0.93, es: 0.95, ru: 0.90, ar: 0.86, tr: 0.95
  };
  var SLOW = {
    de: 0.62, en: 0.64, fr: 0.62, es: 0.64, ru: 0.58, ar: 0.52, tr: 0.64
  };

  function rateFor(lang, incoming) {
    var p = String(lang || '').split('-')[0].toLowerCase();
    var slowMode = incoming && incoming < 0.72;     // speakSlow() 0.55 gönderir
    var table = slowMode ? SLOW : RATE;
    var r = table[p] || (slowMode ? 0.62 : 0.94);
    return Math.max(0.4, Math.min(1.3, r));
  }

  /* ======================================================================
     4 · CHROME / iOS DÜZELTMELERİ
     ==================================================================== */

  /* Chrome ~15 saniye sonra sentezleyiciyi kendiliğinden duraklatır ve
     bazı Android sürümlerinde "paused" durumunda takılı kalır. */
  var keepAlive = null;
  function startKeepAlive() {
    if (keepAlive) return;
    keepAlive = setInterval(function () {
      if (!synth.speaking) { stopKeepAlive(); return; }
      try { if (synth.paused) synth.resume(); } catch (e) {}
    }, 4000);
  }
  function stopKeepAlive() {
    if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
  }

  /* Sekme arkaplana alınıp geri gelince takılan sesi kurtar */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && synth.paused) { try { synth.resume(); } catch (e) {} }
  });

  /* ======================================================================
     5 · KONUŞMA
     ==================================================================== */
  var token = 0;              // eski çağrıların geri dönüşlerini yok saymak için
  var pending = null;

  function speakNative(text, lang, rate, onResult) {
    var myToken = ++token;
    var done = false;

    function finish(ok) {
      if (done || myToken !== token) return;
      done = true;
      stopKeepAlive();
      if (onResult) onResult(ok);
    }

    if (!text) { finish(false); return; }

    /* Hızlı kart geçişinde her tıklama öncekini kelimenin ortasında
       kesiyordu. Kısa bir bekleme, art arda basışları tek ve temiz bir
       seslendirmede birleştirir. */
    if (pending) { clearTimeout(pending); pending = null; }

    try { synth.cancel(); } catch (e) {}

    pending = setTimeout(function () {
      pending = null;
      if (myToken !== token) return;

      withVoices(function () {
        if (myToken !== token) return;
        try {
          var u = new SpeechSynthesisUtterance(String(text));
          var v = pickVoice(lang);
          if (v) { u.voice = v; u.lang = v.lang; }
          else { u.lang = lang; }

          u.rate = rateFor(lang, rate);
          u.pitch = 1.0;          // nöral seslerde pitch oynatmak kaliteyi bozar
          u.volume = 1.0;

          var started = false;
          u.onstart = function () { started = true; startKeepAlive(); };
          u.onend = function () { finish(true); };
          u.onerror = function (e) {
            /* kullanıcı yeni kelimeye geçtiyse bu bir hata değil */
            if (e && (e.error === 'interrupted' || e.error === 'canceled')) { done = true; return; }
            finish(false);
          };

          synth.speak(u);

          /* Ses 2.5 sn içinde başlamadıysa motor takılmıştır → yedek sisteme geç */
          setTimeout(function () {
            if (!started && !done && myToken === token) {
              try { synth.cancel(); } catch (e2) {}
              finish(false);
            }
          }, 2500);
        } catch (err) {
          finish(false);
        }
      });
    }, 70);   // cancel() ile speak() arasındaki Chrome yarış durumunu da çözer
  }

  /* ======================================================================
     6 · MOTORU ISIT
     iOS, sentezleyiciyi ancak bir kullanıcı hareketi içinde "açar".
     ==================================================================== */
  function warmUpSpeech() {
    try {
      refresh();
      var u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.rate = 1;
      synth.speak(u);
      setTimeout(function () { try { synth.cancel(); } catch (e) {} }, 250);
    } catch (e) {}
  }

  /* ======================================================================
     7 · DEVRALMA
     ==================================================================== */
  window.pickVoice = pickVoice;
  window.speakNative = speakNative;
  window.warmUpSpeech = warmUpSpeech;

  /* Geliştirici aracı: konsola hangi dilde hangi sesin seçildiğini yazar. */
  window.VOICE_debug = function () {
    refresh();
    var out = [];
    ['de-DE', 'en-US', 'ar-SA', 'fr-FR', 'es-ES', 'ru-RU'].forEach(function (l) {
      var v = pickVoice(l);
      out.push({
        dil: l,
        secilen: v ? v.name : '— yok —',
        kod: v ? v.lang : '',
        puan: v ? scoreVoice(v, l.toLowerCase()) : '',
        yerel: v ? v.localService : ''
      });
    });
    if (console.table) console.table(out); else console.log(out);
    console.log('Toplam ses sayısı:', voices.length);
    return out;
  };
})();
