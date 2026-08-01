/* ============================================================================
   voice.js — Seslendirme güvenilirliği

   ── ÖNEMLİ NOT ──────────────────────────────────────────────────────────
   Bu dosyanın önceki sürümü SESİ SEÇEN algoritmayı da değiştiriyordu.
   O yanlıştı: hazırladığım tercih listesinde İngilizce için erkek sesler
   (Evan, Daniel) üst sıradaydı; cihazda "Ava" bulunmayınca sistem kalın,
   yaşlı bir erkek sesine düşüyordu. Eski sistem ise "Samantha"yı seçiyordu.

   Bu yüzden SES SEÇİMİ TAMAMEN ESKİ HÂLİNE DÖNDÜ:
   index.html içindeki orijinal pickVoice() devrede, bu dosya ona dokunmuyor.

   Burada yalnızca "nasıl konuşulduğu" iyileştirilir:
     · Chrome'un cancel() + speak() yarış durumu (cümlenin sessizce düşmesi)
     · ~15 sn sonra sentezleyicinin kendiliğinden duraklaması
     · Hızlı kart geçişinde kelimenin ortasında kesilme
     · Yavaş mod (🐢) — aşağıda açıklandı
   ========================================================================== */
(function () {
  'use strict';

  if (!('speechSynthesis' in window)) return;
  var synth = window.speechSynthesis;

  /* ======================================================================
     YAVAŞ MOD (kaplumbağa)

     Eski kod yavaş okuma için rate = 0.55 gönderiyordu. Sorun şu: konuşma
     motorlarının çoğu 0.6'nın altında sesi gerçekten uzatmaz, örnekleri
     tekrarlar. Sonuç titrek ve boğuk bir okumadır — özellikle iOS'un
     sıkıştırılmış seslerinde.

     0.70, hemen her motorun hâlâ doğal ürettiği en yavaş bölgedir:
     belirgin şekilde yavaş ama net. Ayrıca yavaş modda kelimenin sonuna
     nokta eklenir; motor tek başına duran kelimeyi aceleyle kesmek yerine
     tamamlanmış bir ifade gibi bitirir.
     ==================================================================== */
  /* Kullanıcı isteği üzerine bir kademe daha yavaşlatıldı (0.70 → 0.58).
     0.5'in altına inmedim çünkü orada çoğu motor sesi gerçekten uzatmak
     yerine örnekleri tekrarlamaya başlıyor ve titrek/anlaşılmaz çıkıyor —
     bu tam da bir önceki şikâyetin sebebiydi. 0.58 hâlâ belirgin şekilde
     yavaş ama net kalan en düşük nokta. Cihazında hâlâ hızlı geliyorsa
     bu satırı 0.5'e kadar indirebilirsin; altına inmeyi önermem. */
  var SLOW_RATE = 0.58;
  var NORMAL_RATE = 0.92;      /* orijinal değer — değiştirilmedi */

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

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && synth.paused) { try { synth.resume(); } catch (e) {} }
  });

  var token = 0;
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

    var slow = rate && rate < 0.8;
    var spoken = String(text);
    if (slow && !/[.!?]$/.test(spoken)) spoken += '.';

    if (pending) { clearTimeout(pending); pending = null; }
    try { synth.cancel(); } catch (e) {}

    pending = setTimeout(function () {
      pending = null;
      if (myToken !== token) return;

      try {
        var u = new SpeechSynthesisUtterance(spoken);

        /* Ses seçimi orijinal fonksiyona bırakılır. */
        var v = null;
        try { if (typeof window.pickVoice === 'function') v = window.pickVoice(lang); } catch (e) {}
        if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = lang; }

        u.rate = slow ? SLOW_RATE : (rate || NORMAL_RATE);
        u.pitch = 1.0;
        u.volume = 1.0;

        var started = false;
        u.onstart = function () { started = true; startKeepAlive(); };
        u.onend = function () { finish(true); };
        u.onerror = function (e) {
          /* kullanıcı yeni kelimeye geçtiyse bu hata değil */
          if (e && (e.error === 'interrupted' || e.error === 'canceled')) { done = true; return; }
          finish(false);
        };

        synth.speak(u);

        setTimeout(function () {
          if (!started && !done && myToken === token) {
            try { synth.cancel(); } catch (e2) {}
            finish(false);          /* → Google TTS yedeğine geçer */
          }
        }, 2500);
      } catch (err) {
        finish(false);
      }
    }, 60);
  }

  function warmUpSpeech() {
    try {
      if (typeof window.loadVoices === 'function') window.loadVoices();
      var u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.rate = 1;
      synth.speak(u);
      setTimeout(function () { try { synth.cancel(); } catch (e) {} }, 250);
    } catch (e) {}
  }

  /* Sadece bu ikisi devralınır. pickVoice'a DOKUNULMAZ. */
  window.speakNative = speakNative;
  window.warmUpSpeech = warmUpSpeech;

  window.VOICE_debug = function () {
    var list = [];
    try { list = synth.getVoices() || []; } catch (e) {}
    var out = [];
    ['de-DE', 'en-US', 'ar-SA', 'fr-FR', 'es-ES', 'ru-RU'].forEach(function (l) {
      var v = null;
      try { v = window.pickVoice(l); } catch (e) {}
      out.push({ dil: l, secilen: v ? v.name : '— yok —', kod: v ? v.lang : '' });
    });
    if (console.table) console.table(out); else console.log(out);
    console.log('Toplam ses sayısı:', list.length);
    return out;
  };
})();
