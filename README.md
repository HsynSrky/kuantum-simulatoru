# Kuantum Ruhu Simulatoru

Three.js ve Vite ile gelistirilmis, state-vector tabanli interaktif kuantum simulatoru.
Bu proje kuantum kavramlarini (superpozisyon, olcum, dolaniklik, gurultu/decoherence) gorsel ve deneysel olarak anlatir.

## One Cikan Ozellikler

- Gercek state-vector hesaplama (kompleks genlik modeli)
- Tek qubit kapilari: `H`, `X`, `Z(theta)`
- Iki qubit kapisi: `C-X (CNOT)`
- Bell durumu uretimi ve dolaniklik gorsellestirmesi
- Deutsch algoritmasi senaryosu (4 oracle kutusu)
- Decoherence simulasyonu:
  - Dephasing
  - Amplitude damping
- Seed tabanli deterministik rastgelelik
- Sandbox modu:
  - Surukle-birak devre kurma
  - Devreyi adim adim calistirma
- Event log + state paylas/yukle (JSON)

## Teknolojiler

- `JavaScript (ES Modules)`
- `Three.js`
- `Vite`

## Kurulum

```bash
npm install
```

## Gelistirme Modu

```bash
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## Kullanim Ozeti

1. `Seed` belirle (ornek: `cern`) ve `Reset` ile basla.
2. `Aktif` qubit secip `H/X/Z` uygula.
3. `C-X` ile kontrol/hedef secerek iki qubit etkilesimi olustur.
4. `Dolasiklik Yarat` ile Bell senaryosunu calistir.
5. `Gizemli Kutu` + `Kuantum Sorgusu Yap` ile Deutsch sonucunu gozlemle.
6. `Sandbox` modunda kendi devreni surukle-birak ile kur.

## Proje Yapisi

```text
.
|- src/
|  |- main.js      # UI, sahne, etkilesim, algoritma akislari
|  `- quantum.js   # Kuantum register, kapilar, olcum, gurultu kanallari
|- index.html
|- vite.config.js
`- package.json
```

## Not

Bu repo egitsel/gorsel odaklidir. Akademik simulasyon hassasiyeti yerine anlasilirlik ve interaktif deneyim onceliklenmistir.
