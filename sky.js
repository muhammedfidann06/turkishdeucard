/* ============================================================================
   sky.js — Sinematik gece atmosferi motoru
   Dil Kartları · gece yarısı, sakin bir gölün kıyısı

   Katmanlar (arkadan öne):
     1  Derin yıldız alanı  (offscreen, tek seferlik render)
     2  Samanyolu           (aynı offscreen içinde)
     3  Aurora borealis     (sinüs şeritleri)
     4  Parıldayan yıldızlar
     5  Kayan yıldızlar
     6  Ay + ay halesi
     7  Uzak bulut katmanı
     8  Uzaktaki kuş sürüleri
     9  Ufuk ışığı + kıyı ışıkları
     10 Göl yüzeyi + ay yansıması
     11 Orta bulut katmanı + atmosferik sis
     12 Yakın bulut katmanı
     13 Ateş böcekleri, uçuşan tozlar, kelebekler

   Tasarım kararları:
     · Tek rAF döngüsü. Katman başına ayrı canvas yok.
     · Tüm yumuşak ışıklar önceden sprite'a render edilir; kare içinde
       shadowBlur kullanılmaz (mobilde en pahalı işlem odur).
     · 500+ yıldızın çoğu statiktir ve tek bir drawImage ile basılır.
     · Kare süresi izlenir; cihaz zorlanırsa kalite kademeli düşer.
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('sky');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(hover: none)').matches;
  var MOBILE = coarse || window.innerWidth < 760;

  /* ---------------------------------------------------------------- kalite */
  var Q = {
    dust: MOBILE ? 420 : 760,       // statik yıldız (tek blit — bedava)
    twinkle: MOBILE ? 44 : 120,     // her biri ayrı blit — asıl maliyet
    fireflies: MOBILE ? 9 : 20,
    motes: MOBILE ? 10 : 26,
    butterflies: MOBILE ? 4 : 5,
    clouds: MOBILE ? [2, 2, 2] : [4, 4, 3],
    aurora: MOBILE ? 2 : 4,
    shoreLights: MOBILE ? 20 : 48
  };

  var W = 0, H = 0, DPR = 1;
  var t = 0;                 // saniye cinsinden sahne zamanı
  var running = true;
  var reduced = false;       // adaptif kalite düşüşü yapıldı mı

  /* ------------------------------------------------------------- yardımcı */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  /* Yumuşak ışık topu — her parlayan şey bunun ölçeklenmiş kopyası */
  function glowSprite(size, r, g, b, core) {
    var c = makeCanvas(size, size), x = c.getContext('2d');
    var h = size / 2;
    var grd = x.createRadialGradient(h, h, 0, h, h, h);
    grd.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + (core || 1) + ')');
    grd.addColorStop(0.18, 'rgba(' + r + ',' + g + ',' + b + ',' + (core || 1) * 0.55 + ')');
    grd.addColorStop(0.45, 'rgba(' + r + ',' + g + ',' + b + ',0.14)');
    grd.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, size, size);
    return c;
  }

  /* Dört uçlu ışık kırılması olan yıldız */
  function starSprite(size, tint) {
    var c = makeCanvas(size, size), x = c.getContext('2d');
    var h = size / 2;
    var grd = x.createRadialGradient(h, h, 0, h, h, h);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.22, 'rgba(' + tint + ',0.75)');
    grd.addColorStop(0.5, 'rgba(' + tint + ',0.13)');
    grd.addColorStop(1, 'rgba(' + tint + ',0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, size, size);

    // ince ışık çizgileri
    x.globalCompositeOperation = 'lighter';
    var ray = x.createLinearGradient(0, h, size, h);
    ray.addColorStop(0, 'rgba(255,255,255,0)');
    ray.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    ray.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = ray;
    x.fillRect(0, h - 0.6, size, 1.2);
    var ray2 = x.createLinearGradient(h, 0, h, size);
    ray2.addColorStop(0, 'rgba(255,255,255,0)');
    ray2.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    ray2.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = ray2;
    x.fillRect(h - 0.6, 0, 1.2, size);
    return c;
  }

  /* Ay yüzeyi — kenar kararması, kraterler, ince atmosfer halkası */
  function moonSprite(size) {
    var c = makeCanvas(size, size), x = c.getContext('2d');
    var h = size / 2, r = size * 0.5;

    var body = x.createRadialGradient(h - r * 0.28, h - r * 0.3, r * 0.06, h, h, r);
    body.addColorStop(0, '#fffdf6');
    body.addColorStop(0.45, '#f2f0e6');
    body.addColorStop(0.78, '#d9dbd6');
    body.addColorStop(1, '#a9aeb8');
    x.beginPath(); x.arc(h, h, r, 0, 6.2832); x.fillStyle = body; x.fill();

    x.save();
    x.beginPath(); x.arc(h, h, r, 0, 6.2832); x.clip();

    // maria — geniş, düşük kontrastlı gri alanlar
    var maria = [[0.62, 0.34, 0.20], [0.38, 0.60, 0.26], [0.70, 0.66, 0.15], [0.30, 0.32, 0.13]];
    for (var i = 0; i < maria.length; i++) {
      var m = maria[i];
      var g = x.createRadialGradient(size * m[0], size * m[1], 0, size * m[0], size * m[1], size * m[2]);
      g.addColorStop(0, 'rgba(150,155,170,0.28)');
      g.addColorStop(1, 'rgba(150,155,170,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, size, size);
    }
    // kraterler
    for (var k = 0; k < 22; k++) {
      var cx = rnd(size * 0.12, size * 0.88), cy = rnd(size * 0.12, size * 0.88);
      var cr = rnd(size * 0.012, size * 0.055);
      x.beginPath(); x.arc(cx, cy, cr, 0, 6.2832);
      x.fillStyle = 'rgba(140,145,160,0.20)'; x.fill();
      x.beginPath(); x.arc(cx - cr * 0.22, cy - cr * 0.22, cr * 0.86, 0, 6.2832);
      x.fillStyle = 'rgba(255,255,252,0.16)'; x.fill();
    }
    // kenar kararması (limb darkening)
    var limb = x.createRadialGradient(h, h, r * 0.55, h, h, r);
    limb.addColorStop(0, 'rgba(10,14,30,0)');
    limb.addColorStop(1, 'rgba(10,14,30,0.42)');
    x.fillStyle = limb; x.fillRect(0, 0, size, size);
    x.restore();

    return c;
  }

  /* Bulut — çok sayıda yumuşak lekeden oluşan tek sprite.
     Ay üstte olduğu için üst kenar aydınlatılır. */
  function cloudSprite(w, h, alpha) {
    var c = makeCanvas(w, h), x = c.getContext('2d');
    var blobs = 20 + Math.floor(Math.random() * 10);
    for (var i = 0; i < blobs; i++) {
      var bx = rnd(w * 0.1, w * 0.9);
      var lift = 1 - Math.abs(bx / w - 0.5) * 1.5;           // ortası kabarık
      var by = h * rnd(0.52, 0.78) - h * 0.26 * Math.max(0, lift) * Math.random();
      var br = rnd(h * 0.20, h * 0.46) * (0.6 + Math.max(0, lift) * 0.7);
      var g = x.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, 'rgba(206,220,244,' + (0.30 * alpha) + ')');
      g.addColorStop(0.55, 'rgba(186,203,236,' + (0.13 * alpha) + ')');
      g.addColorStop(1, 'rgba(170,190,230,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }
    // ay ışığının vurduğu üst kenar
    x.globalCompositeOperation = 'source-atop';
    var rim = x.createLinearGradient(0, h * 0.18, 0, h * 0.72);
    rim.addColorStop(0, 'rgba(232,240,255,' + (0.30 * alpha) + ')');
    rim.addColorStop(1, 'rgba(120,140,190,0)');
    x.fillStyle = rim;
    x.fillRect(0, 0, w, h);
    return c;
  }

  /* Derin yıldız alanı + Samanyolu — sahne boyunca tek seferlik render.
     Ekrandan biraz büyük çizilir ki parallax kaydırırken kenar açılmasın. */
  function buildStarfield(w, h) {
    var pad = 60;
    var c = makeCanvas(w + pad * 2, h + pad * 2), x = c.getContext('2d');
    var cw = c.width, ch = c.height;

    /* Samanyolu: köşeden köşeye uzanan toz bandı */
    x.save();
    x.translate(cw * 0.5, ch * 0.34);
    x.rotate(-0.42);
    var bandLen = cw * 1.5, bandW = ch * 0.46;
    for (var i = 0; i < 26; i++) {
      var px = rnd(-bandLen / 2, bandLen / 2);
      var py = rnd(-bandW / 2, bandW / 2) * (1 - Math.abs(px) / bandLen * 0.7);
      var pr = rnd(bandW * 0.18, bandW * 0.5);
      var g = x.createRadialGradient(px, py, 0, px, py, pr);
      var warm = Math.random() < 0.4;
      g.addColorStop(0, warm ? 'rgba(150,140,205,0.075)' : 'rgba(120,160,215,0.07)');
      g.addColorStop(1, 'rgba(90,110,180,0)');
      x.fillStyle = g;
      x.fillRect(-bandLen / 2, -bandW, bandLen, bandW * 2);
    }
    // bandı kesen koyu toz şeritleri — derinlik hissi
    for (var d = 0; d < 7; d++) {
      var dx = rnd(-bandLen / 2, bandLen / 2), dw = rnd(bandW * 0.5, bandW * 1.4);
      var dg = x.createRadialGradient(dx, rnd(-bandW * 0.2, bandW * 0.2), 0, dx, 0, dw);
      dg.addColorStop(0, 'rgba(6,8,20,0.30)');
      dg.addColorStop(1, 'rgba(6,8,20,0)');
      x.fillStyle = dg;
      x.fillRect(-bandLen / 2, -bandW, bandLen, bandW * 2);
    }
    // band içindeki yoğun yıldız tozu
    for (var s = 0; s < Q.dust * 0.55; s++) {
      var sx = rnd(-bandLen / 2, bandLen / 2);
      var spread = (1 - Math.abs(sx) / bandLen * 0.55);
      var sy = (Math.random() + Math.random() + Math.random() - 1.5) * bandW * 0.42 * spread;
      var sr = Math.random() < 0.9 ? rnd(0.35, 0.8) : rnd(0.9, 1.4);
      x.beginPath(); x.arc(sx, sy, sr, 0, 6.2832);
      x.fillStyle = 'rgba(226,236,255,' + rnd(0.18, 0.72).toFixed(2) + ')';
      x.fill();
    }
    x.restore();

    /* Genel yıldız serpintisi */
    for (var n = 0; n < Q.dust; n++) {
      var nx = Math.random() * cw, ny = Math.random() * ch * 0.92;
      var nr = Math.random() < 0.88 ? rnd(0.35, 0.85) : rnd(0.9, 1.5);
      var tint = Math.random();
      var col = tint < 0.72 ? '226,236,255' : tint < 0.88 ? '186,214,255' : '255,232,206';
      x.beginPath(); x.arc(nx, ny, nr, 0, 6.2832);
      x.fillStyle = 'rgba(' + col + ',' + rnd(0.14, 0.66).toFixed(2) + ')';
      x.fill();
    }
    return { c: c, pad: pad };
  }

  /* -------------------------------------------------------------- sprite'lar */
  var SP = {};
  function buildSprites() {
    SP.star = starSprite(34, '198,224,255');
    SP.starWarm = starSprite(34, '255,226,190');
    SP.glowWhite = glowSprite(64, 255, 252, 235, 0.95);
    SP.glowCyan = glowSprite(64, 150, 235, 255, 0.9);
    SP.glowGold = glowSprite(72, 255, 214, 130, 0.95);
    SP.glowViolet = glowSprite(64, 178, 150, 255, 0.9);
    SP.moon = moonSprite(Math.round(clamp(Math.min(W, H) * 0.30, 120, 260)));
    SP.moonHalo = glowSprite(1024, 190, 214, 255, 0.20);

    /* Su üzerindeki ışık bantları ve kıyı yansımaları.
       Bunlar her karede createLinearGradient ile üretilseydi, kare başına
       ~50 gradient nesnesi doğardı. Bir kez sprite'a çizip kopyalamak
       mobilde ölçülebilir bir kazanç. */
    SP.streak = (function () {
      var c = makeCanvas(128, 4), x = c.getContext('2d');
      var g = x.createLinearGradient(0, 0, 128, 0);
      g.addColorStop(0, 'rgba(226,238,255,0)');
      g.addColorStop(0.5, 'rgba(232,242,255,1)');
      g.addColorStop(1, 'rgba(226,238,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 4);
      return c;
    })();

    function reflSprite(rgb) {
      var c = makeCanvas(4, 96), x = c.getContext('2d');
      var g = x.createLinearGradient(0, 0, 0, 96);
      g.addColorStop(0, 'rgba(' + rgb + ',1)');
      g.addColorStop(0.45, 'rgba(' + rgb + ',0.35)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      x.fillStyle = g; x.fillRect(0, 0, 4, 96);
      return c;
    }
    SP.reflGold = reflSprite('255,206,130');
    SP.reflCyan = reflSprite('150,225,255');
  }

  /* ======================================================================
     SAHNE GÖRSELİ (isteğe bağlı)

     Kodla çizilen manzara, boyanmış bir illüstrasyonun yerini tutamaz.
     Bu yüzden: klasörde bir sahne görseli varsa motor onu kullanır ve
     üstüne SADECE canlı katmanları çizer (kelebek, ateş böceği, kayan
     yıldız, kuş, toz). Görsel yoksa kodla üretilen manzaraya döner.

     Aranan dosya adları (sırayla):
        scene.jpg · scene.png · bg.jpg · bg.png · background.jpg/png

     Görsel bulunduğunda <html> öğesine "has-bg" sınıfı eklenir; CSS de
     kodla çizilen ön plan çerçevesini (çiçekler, fener, masa) gizler —
     çünkü görselin kendisinde zaten vardır.
     ==================================================================== */
  var bgImg = null;

  function loadBackdrop() {
    if (typeof Image === 'undefined') return;
    var names = ['scene.jpg', 'scene.png', 'scene.webp',
                 'bg.jpg', 'bg.png', 'bg.webp',
                 'background.jpg', 'background.png'];
    var i = 0;
    (function next() {
      if (i >= names.length) return;
      var im = new Image();
      im.onload = function () {
        if (!im.naturalWidth) { i++; next(); return; }
        bgImg = im;
        document.documentElement.classList.add('has-bg');
      };
      im.onerror = function () { i++; next(); };
      im.src = names[i];
    })();
  }
  loadBackdrop();

  /* Görseli ekrana "cover" mantığıyla oturtur ve parallax için hafifçe
     büyütür; böylece kaydırırken kenar açılmaz. */
  function drawBackdrop(px, py) {
    var over = 1.06;
    var iw = bgImg.naturalWidth, ih = bgImg.naturalHeight;
    var scale = Math.max(W / iw, H / ih) * over;
    var dw = iw * scale, dh = ih * scale;
    var dx = (W - dw) / 2 + px * 10;
    var dy = (H - dh) / 2 + py * 8;
    ctx.drawImage(bgImg, dx, dy, dw, dh);
  }

  /* ------------------------------------------------------------- varlıklar */
  var field = null;
  var twinkles = [], clouds = [[], [], []], fireflies = [], motes = [],
      butterflies = [], flocks = [], shooting = [], shore = [], fog = [];
  var moon = { x: 0, y: 0, r: 0 };
  var waterY = 0;

  function seedScene() {
    /* parıldayan yıldızlar */
    twinkles.length = 0;
    for (var i = 0; i < Q.twinkle; i++) {
      var roll = Math.random();
      twinkles.push({
        x: Math.random(), y: Math.random() * 0.74,
        s: roll < 0.7 ? rnd(1.4, 2.6) : roll < 0.93 ? rnd(2.8, 4.4) : rnd(4.8, 7.2),
        ph: Math.random() * 6.28,
        sp: rnd(0.35, 1.15),
        warm: Math.random() < 0.18,
        depth: rnd(0.3, 1)
      });
    }

    /* üç bulut katmanı — uzak/orta/yakın */
    var conf = [
      { n: Q.clouds[0], w: 340, h: 120, a: 0.55, y: [0.02, 0.22], sp: 0.0038, sc: [0.55, 0.85], depth: 14 },
      { n: Q.clouds[1], w: 460, h: 160, a: 0.8, y: [0.06, 0.30], sp: 0.0072, sc: [0.85, 1.25], depth: 26 },
      { n: Q.clouds[2], w: 620, h: 220, a: 1.0, y: [0.00, 0.24], sp: 0.0125, sc: [1.3, 1.9], depth: 44 }
    ];
    for (var L = 0; L < 3; L++) {
      clouds[L].length = 0;
      var cf = conf[L];
      for (var c = 0; c < cf.n; c++) {
        clouds[L].push({
          sp: cloudSprite(cf.w, cf.h, cf.a),
          x: Math.random(),                     // 0..1 → ekran genişliğine göre
          y: rnd(cf.y[0], cf.y[1]),
          scale: rnd(cf.sc[0], cf.sc[1]),
          v: cf.sp * rnd(0.75, 1.3),
          alpha: rnd(0.55, 1),
          depth: cf.depth
        });
      }
    }

    /* ateş böcekleri — alt yarıda, suyun üstünde dolanır */
    fireflies.length = 0;
    for (var f = 0; f < Q.fireflies; f++) {
      fireflies.push({
        x: Math.random(), y: rnd(0.55, 0.99),
        ax: Math.random() * 6.28, ay: Math.random() * 6.28,
        vx: rnd(0.12, 0.34), vy: rnd(0.16, 0.42),
        rx: rnd(0.02, 0.09), ry: rnd(0.01, 0.05),
        ph: Math.random() * 6.28, sp: rnd(0.5, 1.4),
        s: rnd(0.35, 0.95),
        gold: Math.random() < 0.75
      });
    }

    /* sihirli toz — çok yavaş yükselen parçacıklar */
    motes.length = 0;
    for (var m = 0; m < Q.motes; m++) {
      motes.push({
        x: Math.random(), y: Math.random(),
        s: rnd(0.5, 1.9), a: rnd(0.12, 0.42),
        vy: rnd(0.004, 0.016), ax: Math.random() * 6.28, sp: rnd(0.2, 0.6),
        ph: Math.random() * 6.28
      });
    }

    /* kelebekler */
    butterflies.length = 0;
    var palette = [
      ['#7fd8ff', '#3b7ff0', '#e8f7ff'],   // mavi morpho
      ['#9fe6ff', '#4f8ff5', '#ffffff'],
      ['#ffb968', '#f26a3d', '#fff0dc'],   // turuncu
      ['#c9a6ff', '#7d5cf6', '#f3ecff'],   // menekşe
      ['#8ef0d8', '#2fb9a3', '#eafff9']    // turkuaz
    ];
    for (var b = 0; b < Q.butterflies; b++) {
      var pal = palette[b % palette.length];
      butterflies.push({
        x: Math.random(), y: rnd(0.28, 0.86),
        homeX: Math.random(), homeY: rnd(0.28, 0.86),
        ax: Math.random() * 6.28, ay: Math.random() * 6.28,
        vx: rnd(0.055, 0.13), vy: rnd(0.07, 0.16),
        rx: rnd(0.10, 0.26), ry: rnd(0.06, 0.16),
        flap: Math.random() * 6.28, flapSp: rnd(11, 16),
        scale: rnd(0.72, 1.15),
        pal: pal, rot: 0, px: 0, py: 0
      });
    }

    /* kıyı ışıkları */
    shore.length = 0;
    for (var sl = 0; sl < Q.shoreLights; sl++) {
      shore.push({
        x: Math.random(),
        y: rnd(-0.012, 0.004),
        s: rnd(0.6, 2.0),
        ph: Math.random() * 6.28,
        sp: rnd(0.6, 2.2),
        refl: rnd(0.14, 0.22),
        gold: Math.random() < 0.72
      });
    }

    /* sis bantları */
    fog.length = 0;
    for (var fg = 0; fg < 3; fg++) {
      fog.push({ x: Math.random(), y: rnd(-0.012, 0.03), v: rnd(0.006, 0.014) * (Math.random() < 0.5 ? -1 : 1), a: rnd(0.022, 0.05), w: rnd(0.45, 0.8) });
    }

    flocks.length = 0;
    shooting.length = 0;
  }

  /* -------------------------------------------------------------- parallax */
  var pointer = { tx: 0, ty: 0, x: 0, y: 0 };

  function onPointer(e) {
    var p = e.touches ? e.touches[0] : e;
    if (!p) return;
    pointer.tx = clamp((p.clientX / window.innerWidth) * 2 - 1, -1, 1);
    pointer.ty = clamp((p.clientY / window.innerHeight) * 2 - 1, -1, 1);
  }
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('touchmove', onPointer, { passive: true });
  /* Sayfa kaydırma artık sahneyi HİÇ etkilemiyor — kasıtlı bir tasarım
     kararı: kaydırma sırasında katmanların birbirine göre kaymasıydı
     "arka plan bozuluyor" şikâyetinin sebebi. Sahne artık sabit bir
     manzara; sadece dokunma/imleç konumuna tepki verir. */

  // Cihaz eğimi — mobilde parmak ekrana değmese de sahne yaşar
  window.addEventListener('deviceorientation', function (e) {
    if (e.gamma == null || e.beta == null) return;
    pointer.tx = clamp(e.gamma / 34, -1, 1);
    pointer.ty = clamp((e.beta - 42) / 34, -1, 1);
  }, { passive: true });

  /* ---------------------------------------------------------------- boyut */
  var resizeTimer = null;
  function resize() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    /* Arka plan sahnesi metin değil; 1.25x çözünürlük gözle ayırt edilmez
       ama doldurulacak piksel sayısını 1.6x'e göre ~%40 azaltır. GPU
       ısınmasının en büyük tek sebebi buydu. */
    DPR = Math.min(window.devicePixelRatio || 1, MOBILE ? 1.25 : 1.75);
    W = vw; H = vh;
    canvas.width = Math.round(vw * DPR);
    canvas.height = Math.round(vh * DPR);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    waterY = H * 0.795;
    moon.r = clamp(Math.min(W, H) * 0.115, 46, 112);
    moon.x = W * 0.795;
    moon.y = H * 0.135;

    buildSprites();
    field = buildStarfield(W, H);
    buildScenery();
  }

  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 180);
  }
  window.addEventListener('resize', scheduleResize, { passive: true });
  window.addEventListener('orientationchange', scheduleResize, { passive: true });

  /* ============================== ÇİZİM ================================== */

  function drawAurora(px, py) {
    if (reduced) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var bands = Q.aurora;
    for (var i = 0; i < bands; i++) {
      var baseY = H * (0.10 + i * 0.052) + py * (5 + i * 2);
      var amp = H * (0.030 + i * 0.012);
      var speed = 0.06 + i * 0.021;
      var hue = i % 2 === 0
        ? ['rgba(90,235,205,', 'rgba(60,150,220,']
        : ['rgba(150,120,255,', 'rgba(80,190,235,'];
      var alpha = (0.030 - i * 0.005) * (0.75 + 0.25 * Math.sin(t * 0.16 + i));
      if (alpha <= 0) continue;

      var g = ctx.createLinearGradient(0, baseY - amp * 2.4, 0, baseY + amp * 3.6);
      g.addColorStop(0, hue[0] + '0)');
      g.addColorStop(0.35, hue[0] + alpha * 3.1 + ')');
      g.addColorStop(0.62, hue[1] + alpha * 1.7 + ')');
      g.addColorStop(1, hue[1] + '0)');
      ctx.fillStyle = g;

      ctx.beginPath();
      var step = W / 22;
      ctx.moveTo(-step, baseY);
      for (var x = -step; x <= W + step; x += step) {
        var u = x / W;
        var y = baseY
          + Math.sin(u * 3.1 + t * speed + i * 1.7) * amp
          + Math.sin(u * 7.4 - t * speed * 1.6 + i) * amp * 0.42;
        ctx.lineTo(x, y);
      }
      for (var x2 = W + step; x2 >= -step; x2 -= step) {
        var u2 = x2 / W;
        var y2 = baseY + amp * 2.9
          + Math.sin(u2 * 3.1 + t * speed + i * 1.7) * amp * 1.25
          + Math.sin(u2 * 5.2 + t * speed * 0.8) * amp * 0.5;
        ctx.lineTo(x2, y2);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTwinkles(px, py) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < twinkles.length; i++) {
      var s = twinkles[i];
      var pulse = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
      var a = 0.16 + pulse * 0.84;
      var size = s.s * (0.82 + pulse * 0.34);
      ctx.globalAlpha = a * (0.55 + s.depth * 0.45);
      var img = s.warm ? SP.starWarm : SP.star;
      var d = size * 3.4;
      ctx.drawImage(img,
        s.x * W + px * (2 + s.depth * 5) - d / 2,
        s.y * H + py * (1.5 + s.depth * 3) - d / 2, d, d);
    }
    ctx.restore();
  }

  function drawMoon(px, py) {
    var mx = moon.x + px * 9, my = moon.y + py * 7;
    /* Hale, ayın yarıçapının ~5 katı. Daha büyüğü tüm gökyüzünü yıkıyor,
       manzaranın derinliğini ve yıldızları yok ediyordu. */
    var halo = moon.r * 4.4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.34 + 0.04 * Math.sin(t * 0.35);
    ctx.drawImage(SP.moonHalo, mx - halo / 2, my - halo / 2, halo, halo);
    ctx.restore();

    var d = moon.r * 2;
    ctx.drawImage(SP.moon, mx - moon.r, my - moon.r, d, d);

    // ince soğuk kenar ışığı
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.30;
    ctx.beginPath();
    ctx.arc(mx, my, moon.r * 1.02, 0, 6.2832);
    ctx.strokeStyle = 'rgba(190,222,255,0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    return { x: mx, y: my };
  }

  function drawClouds(layer, px, py, dt) {
    var arr = clouds[layer];
    ctx.save();
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      c.x += c.v * dt;
      var w = c.sp.width * c.scale * (W / 420);
      var h = c.sp.height * c.scale * (W / 420);
      if (c.x * W - w > W + 40) { c.x = -(w / W) - 0.1; c.y = rnd(0, 0.28); }
      ctx.globalAlpha = c.alpha * (reduced ? 0.7 : 1);
      ctx.drawImage(c.sp,
        c.x * W + px * c.depth - w * 0.5,
        c.y * H + py * c.depth * 0.55, w, h);
    }
    ctx.restore();
  }

  /* ======================================================================
     MANZARA — uzak dağlar, karşı kıyı ve göl kasabası

     Bu katman sahnenin hikâyesini anlatan kısım. Hepsi bir kez offscreen
     canvas'a çizilir, sonra her karede sadece kopyalanır; böylece yüzlerce
     bina ve pencere hiçbir kare maliyeti çıkarmaz.

     Derinlik hissi "atmosferik perspektif" ile kurulur: uzaktaki dağ daha
     açık ve maviye çalar, yakındaki tepe neredeyse siyahtır.
     ==================================================================== */
  var SC = null;

  /* Dalgalı bir sırt çizgisi üretir. Üç farklı frekanstaki sinüsün
     toplamı, tekrar ettiği belli olmayan doğal bir siluet verir. */
  function ridgeY(u, hgt, base, freq, rough, seed) {
    var y = hgt * (base
      - Math.sin(u * freq + seed) * 0.26
      - Math.sin(u * freq * 2.37 + seed * 1.7) * 0.13 * rough
      - Math.sin(u * freq * 5.11 + seed * 0.6) * 0.05 * rough);
    return clamp(y, hgt * 0.06, hgt);
  }

  function mountainSprite(hgt, top, bot, rim, freq, rough, seed, base) {
    var c = makeCanvas(W + 80, hgt), x = c.getContext('2d');
    var cw = c.width;
    var g = x.createLinearGradient(0, 0, 0, hgt);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);

    var step = Math.max(3, cw / 120);
    x.beginPath();
    x.moveTo(0, hgt);
    for (var i = 0; i <= cw; i += step) x.lineTo(i, ridgeY(i / cw, hgt, base, freq, rough, seed));
    x.lineTo(cw, hgt);
    x.closePath();
    x.fillStyle = g;
    x.fill();

    /* Ay ışığının sırt çizgisine vurduğu ince kenar */
    if (rim) {
      x.beginPath();
      for (var j = 0; j <= cw; j += step) {
        var y = ridgeY(j / cw, hgt, base, freq, rough, seed);
        if (j === 0) x.moveTo(j, y); else x.lineTo(j, y);
      }
      x.strokeStyle = rim;
      x.lineWidth = 1.1;
      x.stroke();
    }
    return c;
  }

  /* Göl kenarındaki kasaba: sağdaki yamaca kurulmuş, suya doğru inen
     teraslı evler. Pencereler sıcak; sudaki yansımaları sahnenin en
     "yaşayan" parçası. */
  function villageSprite() {
    var vh = Math.round(H * 0.2);
    var c = makeCanvas(W + 80, vh), x = c.getContext('2d');
    var cw = c.width;
    var wins = [];

    /* kasabanın oturduğu burun */
    var slope = function (u) {
      /* sağa doğru yükselen, suya doğru inen yamaç */
      return vh * (1.02 - Math.pow(clamp((u - 0.42) / 0.58, 0, 1), 0.75) * 0.82);
    };
    x.beginPath();
    x.moveTo(cw, vh);
    for (var i = cw; i >= cw * 0.40; i -= 4) x.lineTo(i, slope(i / cw));
    x.lineTo(cw * 0.40, vh);
    x.closePath();
    x.fillStyle = 'rgba(9,11,26,0.96)';
    x.fill();

    /* binalar — yamaç boyunca kademeli */
    var count = MOBILE ? 46 : 68;
    for (var b = 0; b < count; b++) {
      var u = rnd(0.44, 1.0);
      var gy = slope(u);
      var bw = rnd(vh * 0.07, vh * 0.16);
      var bh = rnd(vh * 0.10, vh * 0.26);
      var bx = u * cw - bw / 2;
      var by = gy - bh + rnd(-vh * 0.03, vh * 0.06);
      if (by + bh > vh) bh = vh - by;
      if (bh < 4) continue;

      x.fillStyle = 'rgba(14,15,30,0.97)';
      x.fillRect(bx, by, bw, bh);
      /* çatı */
      x.beginPath();
      x.moveTo(bx - 1.5, by);
      x.lineTo(bx + bw / 2, by - bh * 0.22);
      x.lineTo(bx + bw + 1.5, by);
      x.closePath();
      x.fillStyle = 'rgba(10,11,24,0.97)';
      x.fill();

      /* pencereler */
      var cols = Math.max(1, Math.floor(bw / 5));
      var rows = Math.max(1, Math.floor(bh / 6));
      for (var r = 0; r < rows; r++) {
        for (var q = 0; q < cols; q++) {
          if (Math.random() < 0.42) continue;
          var wx = bx + 2 + q * (bw - 3) / cols;
          var wy = by + 3 + r * (bh - 4) / rows;
          var ww = Math.max(1.1, bw / cols * 0.42);
          var wh2 = Math.max(1.4, bh / rows * 0.42);
          x.fillStyle = Math.random() < 0.8 ? 'rgba(255,196,116,0.95)' : 'rgba(255,232,190,0.95)';
          x.fillRect(wx, wy, ww, wh2);
          if (wins.length < 40 && Math.random() < 0.3) {
            wins.push({ x: (wx + ww / 2) / cw, y: wy + wh2 / 2, s: rnd(0.5, 1.2),
                        ph: Math.random() * 6.28, sp: rnd(0.5, 1.8) });
          }
        }
      }
    }

    /* kasabanın üstüne çöken sıcak ışık kubbesi */
    x.globalCompositeOperation = 'lighter';
    var warm = x.createRadialGradient(cw * 0.78, vh * 0.62, 0, cw * 0.78, vh * 0.62, cw * 0.34);
    warm.addColorStop(0, 'rgba(255,178,96,0.16)');
    warm.addColorStop(1, 'rgba(255,150,70,0)');
    x.fillStyle = warm;
    x.fillRect(0, 0, cw, vh);

    return { c: c, wins: wins, h: vh };
  }

  /* Bir sprite'ın dikey aynası + aşağı doğru sönümlenen saydamlık.
     Sudaki yansıma bundan üretilir. */
  function mirrorFade(src, fade) {
    var c = makeCanvas(src.width, src.height), x = c.getContext('2d');
    x.save();
    x.translate(0, src.height);
    x.scale(1, -1);
    x.drawImage(src, 0, 0);
    x.restore();
    x.globalCompositeOperation = 'destination-out';
    var g = x.createLinearGradient(0, 0, 0, src.height);
    g.addColorStop(0, 'rgba(0,0,0,' + (1 - (fade || 0.55)) + ')');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = g;
    x.fillRect(0, 0, src.width, src.height);
    return c;
  }

  function buildScenery() {
    var v = villageSprite();
    var far = mountainSprite(Math.round(H * 0.16),
      'rgba(86,104,168,0.55)', 'rgba(52,66,124,0.72)',
      'rgba(178,206,255,0.30)', 4.2, 0.8, 1.7, 0.60);
    var mid = mountainSprite(Math.round(H * 0.13),
      'rgba(34,44,92,0.9)', 'rgba(16,22,54,0.95)',
      'rgba(150,184,246,0.22)', 6.1, 1.0, 4.3, 0.55);

    SC = {
      far: far, mid: mid,
      village: v.c, wins: v.wins, vh: v.h,
      farR: mirrorFade(far, 0.72),
      midR: mirrorFade(mid, 0.66),
      villageR: mirrorFade(v.c, 0.52)
    };
  }

  function drawScenery(px, py) {
    if (!SC) return;
    var y = waterY + py * 4;

    /* Uzaktan yakına: her katman biraz daha fazla parallax alır. */
    ctx.drawImage(SC.far, -40 + px * 5, y - SC.far.height + 1);
    ctx.drawImage(SC.mid, -40 + px * 9, y - SC.mid.height + 1);
    ctx.drawImage(SC.village, -40 + px * 13, y - SC.vh + 1);

    /* yanıp sönen birkaç pencere — kasabanın yaşadığını gösterir */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var cw = SC.village.width;
    for (var i = 0; i < SC.wins.length; i++) {
      var wn = SC.wins[i];
      var a = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(t * wn.sp + wn.ph));
      var d = 5 + wn.s * 9;
      ctx.globalAlpha = a * 0.6;
      ctx.drawImage(SP.glowGold,
        -40 + px * 13 + wn.x * cw - d / 2,
        y - SC.vh + wn.y - d / 2, d, d);
    }
    ctx.restore();
  }

  /* ======================================================================
     GÖL
     Su, üstündeki her şeyin aynasıdır: dağlar, kasaba ve ay. Yansımalar
     yatay dilimler hâlinde, her dilim kendi ritminde kaydırılarak çizilir —
     bu, tek bir aynalı kopyayı canlı bir su yüzeyine dönüştürür.
     ==================================================================== */
  function drawWater(px, py, moonPos) {
    var y = waterY + py * 4;
    var hgt = H - y + 4;
    if (hgt <= 2) return;

    ctx.save();

    /* su gövdesi */
    var g = ctx.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, 'rgba(13,20,48,0.62)');
    g.addColorStop(0.35, 'rgba(8,13,34,0.78)');
    g.addColorStop(1, 'rgba(3,5,14,0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, hgt);

    /* --- manzaranın yansıması --- */
    if (SC) {
      var slices = MOBILE ? 7 : 16;
      var sets = [
        { img: SC.farR, dx: px * 5, a: 0.30 },
        { img: SC.midR, dx: px * 9, a: 0.34 },
        { img: SC.villageR, dx: px * 13, a: 0.46 }
      ];
      for (var s = 0; s < sets.length; s++) {
        var set = sets[s];
        var img = set.img;
        var sh = img.height / slices;
        for (var i = 0; i < slices; i++) {
          var dy = y + i * sh;
          if (dy > H) break;
          var wob = Math.sin(t * 1.05 + i * 0.62 + s) * (1.5 + i * 1.15);
          ctx.globalAlpha = set.a * (1 - i / slices * 0.35);
          ctx.drawImage(img, 0, i * sh, img.width, sh,
            -40 + set.dx + wob, dy, img.width, sh + 0.6);
        }
      }
      ctx.globalAlpha = 1;
    }

    /* --- ayın suya düşen ışık yolu --- */
    ctx.globalCompositeOperation = 'lighter';
    var col = clamp(moonPos.x + (px * -6), 0, W);
    var bands = MOBILE ? 10 : 24;
    var bandH = Math.max(1.4, hgt / bands * 0.6);
    for (var k = 0; k < bands; k++) {
      var f = k / bands;
      var by = y + f * hgt;
      var spread = moon.r * (0.5 + f * 3.2);
      var wob2 = Math.sin(t * 1.15 + k * 0.85) * (5 + f * 24);
      var a2 = (1 - f) * 0.16 * (0.55 + 0.45 * Math.sin(t * 1.9 + k * 1.6));
      if (a2 <= 0.003) continue;
      ctx.globalAlpha = a2;
      ctx.drawImage(SP.streak, col - spread + wob2, by, spread * 2, bandH);
    }

    /* --- kasaba ışıklarının suda uzayan izleri --- */
    if (SC) {
      var cw2 = SC.village.width;
      for (var w2 = 0; w2 < SC.wins.length; w2 += 2) {
        var wn2 = SC.wins[w2];
        var sx = -40 + px * 13 + wn2.x * cw2;
        ctx.globalAlpha = 0.12 + 0.12 * Math.sin(t * wn2.sp * 1.3 + wn2.ph);
        ctx.drawImage(SP.reflGold,
          sx - 1.8 + Math.sin(t * 1.8 + w2) * 2.4, y, 3.6, hgt * 0.34);
      }
    }

    /* --- su yüzeyindeki ince parıltı çizgileri --- */
    ctx.globalAlpha = 0.05;
    for (var L = 0; L < 5; L++) {
      var ly = y + hgt * (0.18 + L * 0.17) + Math.sin(t * 0.7 + L) * 2;
      ctx.drawImage(SP.streak, W * 0.1 + Math.sin(t * 0.5 + L * 2) * W * 0.1, ly, W * 0.8, 1.2);
    }

    ctx.restore();
  }

  function drawFog(px, py, dt) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < fog.length; i++) {
      var f = fog[i];
      f.x += f.v * dt;
      if (f.x > 1.5) f.x = -0.5; if (f.x < -0.5) f.x = 1.5;
      var fx = f.x * W + px * 30;
      var fy = waterY + f.y * H + py * 12;
      var fw = W * f.w, fh = H * 0.13;
      var g = ctx.createRadialGradient(fx, fy, 0, fx, fy, fw * 0.5);
      g.addColorStop(0, 'rgba(180,205,245,' + f.a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(150,180,235,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(fx, fy); ctx.scale(1, fh / (fw * 0.5) * 1.4); ctx.translate(-fx, -fy);
      ctx.fillRect(fx - fw * 0.5, fy - fw * 0.5, fw, fw);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawFireflies(px, py, dt) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < fireflies.length; i++) {
      var f = fireflies[i];
      f.ax += f.vx * dt; f.ay += f.vy * dt;
      var fx = (f.x + Math.sin(f.ax) * f.rx) * W + px * 30;
      var fy = (f.y + Math.sin(f.ay * 1.3) * f.ry) * H + py * 18;
      var pulse = Math.pow(0.5 + 0.5 * Math.sin(t * f.sp + f.ph), 2.2);
      var a = 0.12 + pulse * 0.88;
      var d = (7 + f.s * 16) * (0.7 + pulse * 0.5);
      ctx.globalAlpha = a * 0.9;
      ctx.drawImage(f.gold ? SP.glowGold : SP.glowCyan, fx - d / 2, fy - d / 2, d, d);
      // çekirdek
      ctx.globalAlpha = a;
      ctx.fillStyle = f.gold ? 'rgba(255,238,190,0.95)' : 'rgba(220,250,255,0.95)';
      ctx.beginPath(); ctx.arc(fx, fy, 0.8 + f.s * 0.9, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  function drawMotes(px, py, dt) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.y -= m.vy * dt;
      m.ax += dt * m.sp;
      if (m.y < -0.03) { m.y = 1.03; m.x = Math.random(); }
      var mx = (m.x + Math.sin(m.ax) * 0.03) * W + px * 34;
      var my = m.y * H + py * 20;
      ctx.globalAlpha = m.a * (0.5 + 0.5 * Math.sin(t * 0.8 + m.ph));
      var d = m.s * 9;
      ctx.drawImage(SP.glowWhite, mx - d / 2, my - d / 2, d, d);
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------- kelebek */
  function drawButterfly(b, px, py, dt) {
    b.ax += b.vx * dt; b.ay += b.vy * dt;
    var nx = (b.homeX + Math.sin(b.ax) * b.rx + Math.sin(b.ax * 0.37) * b.rx * 0.5) * W + px * 38;
    var ny = (b.homeY + Math.sin(b.ay * 1.21) * b.ry + Math.cos(b.ay * 0.53) * b.ry * 0.6) * H + py * 24;

    var dx = nx - (b.px || nx), dy = ny - (b.py || ny);
    b.px = nx; b.py = ny;
    var target = Math.atan2(dy, dx);
    // yumuşak dönüş
    var diff = Math.atan2(Math.sin(target - b.rot), Math.cos(target - b.rot));
    b.rot += diff * Math.min(1, dt * 3.5);

    var speed = Math.sqrt(dx * dx + dy * dy) / Math.max(dt, 0.001);
    b.flap += dt * (b.flapSp + Math.min(speed * 0.02, 6));
    var flap = Math.sin(b.flap);
    var open = 0.18 + Math.abs(flap) * 0.92;      // kanat açıklığı
    var s = b.scale * (W < 420 ? 0.85 : 1) * 1.25;

    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(b.rot + Math.sin(b.flap * 0.5) * 0.06);
    ctx.scale(s, s);

    // kanat altındaki yumuşak ışık
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 + Math.abs(flap) * 0.12;
    ctx.drawImage(SP.glowViolet, -22, -18, 44, 36);
    ctx.restore();

    if (!b.grad) {
      var gr = ctx.createLinearGradient(0, -10, 14, 8);
      gr.addColorStop(0, b.pal[2]);
      gr.addColorStop(0.42, b.pal[0]);
      gr.addColorStop(1, b.pal[1]);
      b.grad = gr;
    }

    for (var side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.scale(side * open, 1);
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = b.grad;
      // üst kanat
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.bezierCurveTo(2, -11, 12.5, -12.5, 12, -3.5);
      ctx.bezierCurveTo(11.6, 1.4, 4.5, 2.2, 0, -1);
      ctx.fill();
      // alt kanat
      ctx.beginPath();
      ctx.moveTo(0, 0.6);
      ctx.bezierCurveTo(4, 2.4, 10.5, 4.4, 8.4, 8.6);
      ctx.bezierCurveTo(6.4, 12, 1.2, 6.6, 0, 0.6);
      ctx.fill();
      // kanat kenarı
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 0.45;
      ctx.stroke();
      ctx.restore();
    }

    // gövde
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(24,26,44,0.92)';
    ctx.beginPath(); ctx.ellipse(0, 0.6, 1.15, 5.4, 0, 0, 6.2832); ctx.fill();
    // antenler
    ctx.strokeStyle = 'rgba(230,240,255,0.5)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-0.4, -4.4); ctx.quadraticCurveTo(-3.2, -8.4, -4.6, -9.2);
    ctx.moveTo(0.4, -4.4); ctx.quadraticCurveTo(3.2, -8.4, 4.6, -9.2);
    ctx.stroke();
    ctx.restore();
  }

  /* --------------------------------------------------------------- kuşlar */
  function spawnFlock() {
    var dir = Math.random() < 0.5 ? 1 : -1;
    var n = 5 + Math.floor(Math.random() * 7);
    var baseY = rnd(0.30, 0.52);
    var birds = [];
    for (var i = 0; i < n; i++) {
      var row = Math.floor(i / 2), side = i % 2 === 0 ? -1 : 1;
      birds.push({
        ox: row * rnd(16, 26) * -dir + rnd(-5, 5),
        oy: row * rnd(7, 12) * side * 0.6 + rnd(-4, 4),
        ph: Math.random() * 6.28,
        sp: rnd(6.5, 9)
      });
    }
    flocks.push({
      dir: dir,
      x: dir > 0 ? -0.12 : 1.12,
      y: baseY,
      v: rnd(0.020, 0.036) * dir,
      scale: rnd(0.5, 0.95),
      alpha: rnd(0.22, 0.45),
      birds: birds,
      bob: Math.random() * 6.28
    });
  }

  function drawFlocks(px, py, dt) {
    for (var i = flocks.length - 1; i >= 0; i--) {
      var fl = flocks[i];
      fl.x += fl.v * dt;
      fl.bob += dt * 0.4;
      if ((fl.dir > 0 && fl.x > 1.2) || (fl.dir < 0 && fl.x < -0.2)) { flocks.splice(i, 1); continue; }

      var cx = fl.x * W + px * 18;
      var cy = (fl.y + Math.sin(fl.bob) * 0.012) * H + py * 12;

      ctx.save();
      ctx.globalAlpha = fl.alpha;
      ctx.strokeStyle = 'rgba(214,226,246,0.9)';
      ctx.lineWidth = Math.max(0.7, 1.05 * fl.scale);
      ctx.lineCap = 'round';
      for (var b = 0; b < fl.birds.length; b++) {
        var bd = fl.birds[b];
        var bx = cx + bd.ox * fl.scale * fl.dir;
        var by = cy + bd.oy * fl.scale;
        var flap = Math.sin(t * bd.sp + bd.ph);
        var wing = 3.4 * fl.scale;
        var lift = flap * 2.6 * fl.scale;
        ctx.beginPath();
        ctx.moveTo(bx - wing * 2, by + lift * 0.35);
        ctx.quadraticCurveTo(bx - wing, by - lift, bx, by);
        ctx.quadraticCurveTo(bx + wing, by - lift, bx + wing * 2, by + lift * 0.35);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* -------------------------------------------------------- kayan yıldız */
  function addShootingStar(force) {
    var fromRight = Math.random() < 0.72;
    shooting.push({
      x: fromRight ? rnd(0.55, 1.05) : rnd(-0.05, 0.4),
      y: rnd(0.02, 0.30),
      vx: (fromRight ? -1 : 1) * rnd(0.34, 0.58),
      vy: rnd(0.12, 0.22),
      life: 0,
      dur: rnd(1.0, 1.7),
      len: rnd(60, 130),      /* daha kısa iz — daha az dikkat çeker */
      w: rnd(0.8, 1.4)        /* daha ince */
    });
  }
  window.spawnShootingStar = function () { addShootingStar(true); };

  function drawShooting(px, py, dt) {
    for (var i = shooting.length - 1; i >= 0; i--) {
      var s = shooting[i];
      s.life += dt;
      if (s.life > s.dur) { shooting.splice(i, 1); continue; }
      var p = s.life / s.dur;
      s.x += s.vx * dt; s.y += s.vy * dt;

      var x = s.x * W, y = s.y * H;
      var ang = Math.atan2(s.vy * H, s.vx * W);
      var fade = Math.sin(Math.PI * p);           // yumuşak giriş/çıkış
      var len = s.len * (0.35 + p * 0.9);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(x, y);
      ctx.rotate(ang);
      var g = ctx.createLinearGradient(-len, 0, 0, 0);
      g.addColorStop(0, 'rgba(140,190,255,0)');
      g.addColorStop(0.55, 'rgba(180,215,255,' + (0.35 * fade).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,255,255,' + (0.92 * fade).toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-len, -s.w * 0.35);
      ctx.lineTo(0, -s.w * 0.5);
      ctx.lineTo(0, s.w * 0.5);
      ctx.lineTo(-len, s.w * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = fade;
      var d = 26 * (0.6 + fade * 0.6);
      ctx.drawImage(SP.glowWhite, -d / 2, -d / 2, d, d);
      ctx.restore();
    }
  }

  /* ============================== DÖNGÜ ================================== */
  var last = 0, acc = 0, frames = 0, slowFrames = 0;
  var nextFlock = 6, nextStar = 9;

  /* Arka plan sahnesi için 60 FPS gereksiz. Bulut, yıldız ve kelebek gibi
     yavaş hareketler 30 FPS'te de akıcı görünür; buna karşılık GPU işi ve
     pil tüketimi yarıya iner. Arayüzün kendi animasyonları (dokunma, kart
     çevirme, kaydırma) bundan etkilenmez — onlar tarayıcının kendi
     compositor'ında tam hızda çalışır. */
  var MIN_FRAME_MS = MOBILE ? 32 : 0;
  var lastPaint = -1e9;   /* ilk kare, "now" değeri ne olursa olsun mutlaka çizilsin */

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);

    if (MIN_FRAME_MS && now - lastPaint < MIN_FRAME_MS) return;

    if (!last) last = now;
    var dt = (now - last) / 1000;
    last = now;
    lastPaint = now;
    if (dt > 0.1) dt = 0.1;               // sekme geri geldiğinde sıçramayı önle
    t += dt;

    /* adaptif kalite: cihaz zorlanıyorsa bir kez sadeleş */
    if (!reduced) {
      frames++;
      if (dt > (MIN_FRAME_MS ? 0.045 : 0.026)) slowFrames++;
      if (frames > 150) {
        if (slowFrames / frames > 0.35) {
          reduced = true;
          twinkles.length = Math.floor(twinkles.length * 0.55);
          motes.length = Math.floor(motes.length * 0.5);
          fireflies.length = Math.floor(fireflies.length * 0.65);
        }
        frames = 0; slowFrames = 0;
      }
    }

    /* parallax yumuşatma */
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2.6);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2.6);
    var px = reduceMotion ? 0 : -pointer.x;
    /* Kaydırma parallax'ı kaldırıldı: sayfa kayarken sahne katmanları
       birbirine göre oynayınca (özellikle iOS momentum kaydırmasında)
       arka planda titreme/yırtılma görünüyordu. Sahne artık kaydırmadan
       bağımsız — sabit, temiz bir manzara. Hareket azaltmada da imleç
       parallax'ı sıfırlanır; sahnenin kendi içindeki hareketler
       (bulut, ateş böceği, kelebek) etkilenmez. */
    var py = reduceMotion ? 0 : -pointer.y;

    ctx.clearRect(0, 0, W, H);

    /* Sahne görseli varsa: onu çiz, üstüne yalnızca canlı katmanları ekle. */
    if (bgImg) {
      drawBackdrop(px, py);
      nextStar -= dt;
      if (nextStar <= 0) { addShootingStar(); nextStar = rnd(9, 22); }
      drawShooting(px, py, dt);
      nextFlock -= dt;
      if (nextFlock <= 0 && flocks.length < 2) { spawnFlock(); nextFlock = rnd(22, 46); }
      drawFlocks(px, py, dt);
      drawMotes(px, py, dt);
      drawFireflies(px, py, dt);
      for (var bi = 0; bi < butterflies.length; bi++) drawButterfly(butterflies[bi], px, py, dt);
      return;
    }

    /* 1-2 · derin yıldız alanı + samanyolu */
    if (field) {
      ctx.drawImage(field.c, -field.pad + px * 4, -field.pad + py * 3);
    }
    /* 3 · aurora */
    drawAurora(px, py);
    /* 4 · parıldayan yıldızlar */
    drawTwinkles(px, py);
    /* 5 · kayan yıldızlar */
    nextStar -= dt;
    if (nextStar <= 0) { addShootingStar(); nextStar = rnd(16, 34); }   /* daha seyrek */
    drawShooting(px, py, dt);
    /* 6 · ay */
    var moonPos = drawMoon(px, py);
    /* 7 · uzak bulutlar */
    drawClouds(0, px, py, dt);
    /* 8 · kuş sürüleri */
    nextFlock -= dt;
    if (nextFlock <= 0 && flocks.length < 2) { spawnFlock(); nextFlock = rnd(22, 46); }
    drawFlocks(px, py, dt);
    /* 9-10 · manzara ve göl */
    drawScenery(px, py);
    drawWater(px, py, moonPos);
    /* 11 · orta bulutlar + sis */
    drawClouds(1, px, py, dt);
    drawFog(px, py, dt);
    /* 12 · yakın bulutlar */
    drawClouds(2, px, py, dt);
    /* 13 · tozlar, ateş böcekleri, kelebekler */
    drawMotes(px, py, dt);
    drawFireflies(px, py, dt);
    for (var i = 0; i < butterflies.length; i++) drawButterfly(butterflies[i], px, py, dt);
  }

  /* ---------------------------------------------- sekme görünürlüğü / pil */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true; last = 0;
      requestAnimationFrame(frame);
    }
  });

  /* ------------------------------------------------------------ başlangıç
     ÖNEMLİ DÜZELTME: "prefers-reduced-motion" açık olduğunda (birçok
     kurumsal Windows imajında ve macOS/iOS erişilebilirlik ayarında
     varsayılan olarak açıktır) motor daha önce SADECE TEK BİR KARE
     çiziyordu — kelebek, ateş böceği, kayan yıldız ve kuş sürüsü hiç
     çalışmıyordu, çünkü bunlar yalnızca canlı döngüde (frame()) çizilir.

     Bu, "bilgisayarda hiçbir animasyon yok" şikâyetinin tam sebebiydi.

     Doğrusu şu: prefers-reduced-motion, dönme/yakınlaşma/büyük parallax
     gibi baş dönmesi yapabilecek hareketleri kapatmak içindir — yavaş
     sürüklenen bulutlar, usulca yanıp sönen ateş böcekleri gibi çevresel
     hareketler bu kapsamda değildir (macOS'un kendi Aerial ekran
     koruyucuları bile bu ayar açıkken çalışmaya devam eder).

     Artık: canlı döngü HER ZAMAN çalışır. Hareket azaltma sadece imleç/
     parmak parallax'ını devre dışı bırakır (sahne sabit durur, öğeler
     yine de kendi içinde hareket eder). */
  function start() {
    resize();
    seedScene();
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
