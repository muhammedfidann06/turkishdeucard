const EXTRA_VOCAB = [
  // ==========================================
  // GOETHE A1 KELİMELERİ VE ÖRNEK CÜMLELERİ
  // ==========================================
  { 
    lang: "de", level: "A1", cat: "Zaman/Mekan", 
    w: "ab", tr: "itibaren / -den", pos: "edat", 
    ex: "Ab morgen haben wir Ferien.", 
    exTr: "Yarından itibaren tatiliz." 
  },
  { 
    lang: "de", level: "A1", cat: "Bağlaçlar", 
    w: "aber", tr: "ama / fakat", pos: "bağlaç", 
    ex: "Der Film ist traurig, aber sehr schön.", 
    exTr: "Film üzücü ama çok güzel." 
  },
  { 
    lang: "de", level: "A1", cat: "Eylemler", 
    w: "abfahren", tr: "hareket etmek (taşıt)", pos: "fiil", 
    ex: "Der Zug fährt gleich ab.", 
    exTr: "Tren birazdan kalkıyor." 
  },
  { 
    lang: "de", level: "A1", cat: "Eylemler", 
    w: "abgeben", tr: "teslim etmek / vermek", pos: "fiil", 
    ex: "Kann ich das Buch hier abgeben?", 
    exTr: "Kitabı buraya teslim edebilir miyim?" 
  },
  { 
    lang: "de", level: "A1", cat: "Eylemler", 
    w: "abholen", tr: "gidip almak / karşılamak", pos: "fiil", 
    ex: "Ich hole dich am Bahnhof ab.", 
    exTr: "Seni tren istasyonundan alacağım." 
  },
  { 
    lang: "de", level: "A1", cat: "İfadeler", 
    w: "die Achtung", tr: "dikkat", pos: "isim", 
    ex: "Achtung! Jetzt fängt es an.", 
    exTr: "Dikkat! Şimdi başlıyor." 
  },
  { 
    lang: "de", level: "A1", cat: "İletişim", 
    w: "die Adresse", tr: "adres", pos: "isim", 
    ex: "Ich weiß die Adresse nicht.", 
    exTr: "Adresi bilmiyorum." 
  },
  { 
    lang: "de", level: "A1", cat: "Soyut Kavramlar", 
    w: "die Ahnung", tr: "fikir / tahmin", pos: "isim", 
    ex: "Ich habe keine Ahnung!", 
    exTr: "Hiçbir fikrim yok!" 
  },
  { 
    lang: "de", level: "A1", cat: "Zamirler", 
    w: "alle", tr: "herkes / hepsi", pos: "zamir", 
    ex: "Sind alle da? Hast du alles?", 
    exTr: "Herkes burada mı? Her şeyin var mı?" 
  },
  { 
    lang: "de", level: "A1", cat: "Sıfatlar", 
    w: "allein", tr: "yalnız / tek başına", pos: "sıfat/zarf", 
    ex: "Er arbeitet gern allein.", 
    exTr: "O tek başına çalışmayı sever." 
  },

  // ==========================================
  // GOETHE A2 KELİMELERİ VE ÖRNEK CÜMLELERİ
  // ==========================================
  { 
    lang: "de", level: "A2", cat: "Eylemler", 
    w: "ändern", tr: "değiştirmek", pos: "fiil", 
    ex: "Das Wetter hat sich geändert.", 
    exTr: "Hava değişti." 
  },
  { 
    lang: "de", level: "A2", cat: "Sıfatlar", 
    w: "anders", tr: "farklı / başka türlü", pos: "zarf", 
    ex: "Oliver ist anders als seine Freunde.", 
    exTr: "Oliver arkadaşlarından farklıdır." 
  },
  { 
    lang: "de", level: "A2", cat: "Eylemler", 
    w: "ankommen", tr: "varmak / ulaşmak", pos: "fiil", 
    ex: "Wann kommt dieser Zug in Hamburg an?", 
    exTr: "Bu tren Hamburg'a ne zaman varıyor?" 
  },
  { 
    lang: "de", level: "A2", cat: "Seyahat", 
    w: "die Ankunft", tr: "varış / geliş", pos: "isim", 
    ex: "Auf diesem Fahrplan steht nur die Ankunft der Züge.", 
    exTr: "Bu hareket saatleri çizelgesinde sadece trenlerin varış zamanı yazıyor." 
  },
  { 
    lang: "de", level: "A2", cat: "Eylemler", 
    w: "anmelden", tr: "kayıt olmak / bildirmek", pos: "fiil", 
    ex: "Wo kann ich mich anmelden?", 
    exTr: "Nereye kayıt olabilirim?" 
  },
  { 
    lang: "de", level: "A2", cat: "Resmi İşlemler", 
    w: "die Anmeldung", tr: "kayıt / başvuru", pos: "isim", 
    ex: "Wo bekomme ich das Formular für die Anmeldung?", 
    exTr: "Kayıt formunu nereden alabilirim?" 
  },
  { 
    lang: "de", level: "A2", cat: "Teknoloji", 
    w: "der Anrufbeantworter", tr: "telesekreter", pos: "isim", 
    ex: "Sprechen Sie bitte auf den Anrufbeantworter.", 
    exTr: "Lütfen telesekretere konuşun (mesaj bırakın)." 
  },
  { 
    lang: "de", level: "A2", cat: "İletişim", 
    w: "der Anruf", tr: "telefon araması", pos: "isim", 
    ex: "Eva bekommt viele Anrufe von ihrem Freund.", 
    exTr: "Eva erkek arkadaşından birçok arama alıyor." 
  },
  { 
    lang: "de", level: "A2", cat: "Seyahat/Bağlantı", 
    w: "der Anschluss", tr: "aktarma / bağlantı", pos: "isim", 
    ex: "In Mannheim haben Sie Anschluss nach Saarbrücken.", 
    exTr: "Mannheim'da Saarbrücken'e aktarmanız (bağlantınız) var." 
  },
  { 
    lang: "de", level: "A2", cat: "Eylemler", 
    w: "ansehen", tr: "bakmak / izlemek", pos: "fiil", 
    ex: "Darf ich eure Urlaubsfotos ansehen?", 
    exTr: "Tatil fotoğraflarınıza bakabilir miyim?" 
  }
];

