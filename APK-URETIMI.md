# APK / AAB Üretimi — Lumira · Dil Kartları

Site: **https://muhammedfidann06.github.io/lumira/**
Paket adı: **com.lumira.dilkartlari**

---

## ⚠️ Önce şunu yap: assetlinks.json'ın yeri

Bu en kritik adım. Yanlış yere koyarsan uygulama **adres çubuğuyla** açılır.

Digital Asset Links dosyası her zaman **alan adının kökünden** okunur:

```
✅ https://muhammedfidann06.github.io/.well-known/assetlinks.json
❌ https://muhammedfidann06.github.io/lumira/.well-known/assetlinks.json
```

`lumira` reposu bir proje sayfası olduğu için kök adres **başka bir repoya** aittir.
Yani:

1. GitHub'da **`muhammedfidann06.github.io`** adında bir repo oluştur (yoksa).
   Adı tam olarak böyle olmalı — bu senin kullanıcı sayfan.
2. Settings → Pages → Branch `main` / root ile yayınla.
3. İçine `.well-known/assetlinks.json` dosyasını koy (parmak izini aşağıdaki
   adımlardan alacaksın).
4. `https://muhammedfidann06.github.io/.well-known/assetlinks.json` adresi
   tarayıcıda açılmalı.

> `lumira` reposundaki `.well-known/assetlinks.json` zararsız, orada kalabilir;
> ama Android'in okuduğu dosya kökteki olacak.

---

## Yol 1 — PWABuilder (en hızlısı, 5 dakika, kurulum yok)

1. https://www.pwabuilder.com adresine git.
2. Adresi yapıştır: `https://muhammedfidann06.github.io/lumira/` → **Start**.
3. **Android → Package for stores** de.
4. Ayarları kontrol et:
   - Package ID: `com.lumira.dilkartlari`
   - App name: `Lumira | Dil Kartları`
   - Launcher name: `Dil Kartları`
   - Signing key: **Create new** (ilk seferde)
5. **Download package** → inen zip'in içinde:
   - `app-release-signed.apk` → telefona atıp kurabilirsin (test için)
   - `app-release-bundle.aab` → Play Console'a yüklenecek dosya
   - `signing.keystore` + `signing-key-info.txt` → **BUNLARI KAYBETME.**
     Kaybedersen uygulamayı bir daha güncelleyemezsin.
   - `assetlinks.json` → yukarıda anlatılan **kök repoya** koyacağın dosya

---

## Yol 2 — GitHub Actions (repoda hazır, tek tıkla derler)

`.github/workflows/build-android.yml` dosyası pakette hazır geliyor.

1. Dosyaları `lumira` reposuna push et.
2. Repo → **Actions** → "Android APK / AAB üret" → **Run workflow**.
3. 5–10 dakika sonra iş bitince aşağıdaki **Artifacts** kısmından
   `lumira-android` paketini indir. İçinde APK, AAB, `sha256.txt`,
   `assetlinks.json` ve `android.keystore` olacak.
4. **İlk üretimden sonra mutlaka:** `keystore-base64.txt` içeriğini kopyala,
   repo → Settings → Secrets and variables → Actions → New secret:
   - `KEYSTORE_B64` = o base64 metni
   - `KEYSTORE_PASSWORD` = `lumira2026` (istersen değiştir)

   Bunu yapmazsan her derlemede **yeni bir imza anahtarı** üretilir ve
   Play Store güncellemeleri kabul etmez.
5. Yeni sürüm çıkarırken "Run workflow" ekranında `versionCode` değerini artır.

---

## Yol 3 — Kendi bilgisayarında Bubblewrap

Gerekenler: Node.js 18+, JDK 17.

```bash
npm i -g @bubblewrap/cli

mkdir lumira-android && cd lumira-android
bubblewrap init --manifest https://muhammedfidann06.github.io/lumira/manifest.json
# Sorulara: packageId → com.lumira.dilkartlari, launcher name → Dil Kartları
# (veya pakettteki hazır twa-manifest.json dosyasını bu klasöre kopyala)

bubblewrap build
```

Çıktılar: `app-release-signed.apk` ve `app-release-bundle.aab`.

Parmak izini almak için:

```bash
bubblewrap fingerprint list
# veya
keytool -list -v -keystore android.keystore -alias lumira
```

`SHA256:` satırındaki değeri kopyalayıp kök repodaki `assetlinks.json` içine yaz:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.lumira.dilkartlari",
    "sha256_cert_fingerprints": ["AA:BB:CC:... buraya"]
  }
}]
```

---

## Play Store'a yüklerken

- Yüklenecek dosya **`.aab`**'dir (APK sadece kendi telefonunda test için).
- Play Console **App Signing** kullanır: yükledikten sonra
  Release → Setup → App signing ekranındaki **SHA-256** değerini de
  `assetlinks.json` içindeki listeye **ikinci parmak izi olarak ekle**.
  İki parmak izi yan yana durabilir:

  ```json
  "sha256_cert_fingerprints": ["SENIN_ANAHTARIN", "PLAY_APP_SIGNING_ANAHTARI"]
  ```

- Gerekli mağaza materyalleri pakette hazır:
  - Uygulama ikonu: `icon-512.png`
  - Ekran görüntüleri: `screenshot-1.jpg`, `screenshot-2.jpg`, `screenshot-wide.jpg`
  - Öne çıkan görsel (1024×500) için ayrıca bir tasarım istersen söyle.
- Gizlilik politikası bağlantısı zorunludur. Uygulama Firebase üzerinde
  kullanıcı adı + çalışma süresi tuttuğu için bunu belirten kısa bir sayfa yeterli.

---

## Kurulumdan sonra kontrol listesi

- [ ] Uygulama **adres çubuğu olmadan** açılıyor (assetlinks doğru demektir)
- [ ] Simgeye basılı tutunca 4 kısayol çıkıyor
- [ ] Uçak modunda açılıyor
- [ ] Geri tuşu: panel kapatır → sekme değiştirir → iki kez basınca çıkar
- [ ] Ayarlar → Test bildirimi geliyor
