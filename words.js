// Words.js
const COLORS = ["#3dffa0","#4fe8ff","#ff5fb8","#c9ff3e","#9b7bff","#ffd23b"];
function pair(i){ return [COLORS[i%COLORS.length], COLORS[(i+2)%COLORS.length]]; }

let _i = 0;
function add(lang, level, cat, w, tr, pos, ex, exTr){
  const c = pair(_i++);
  // index.html içindeki küresel VOCAB dizisine ekler
  window.VOCAB.push({lang, level, cat, w, tr, pos, ex, exTr, c1:c[0], c2:c[1]});
}

// DEVASA KELİME HAVUZUNUZ BURAYA GELECEK
add("de","A1","Selamlaşma","Hallo","Merhaba","ünlem","Hallo, wie geht's?","Merhaba, nasılsın?");
add("de","A1","Selamlaşma","Guten Morgen","Günaydın","ünlem","Guten Morgen, hast du gut geschlafen?","Günaydın, iyi uyudun mu?");
// ... diğer tüm add satırları ...

