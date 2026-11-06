# IDCARD STUDIO

Generator ID Card otomatis dari template desain asli. 100% berjalan di browser (HTML/CSS/JavaScript murni) — tanpa server, login, database, atau API eksternal. Proyek terpisah, tidak bergantung pada aplikasi lain.

Jenis tersedia: **ID Card Provinsi Bali** (55 × 85 mm, depan & belakang). Jenis lain dapat ditambah lewat registri `IDS.TEMPLATES` di `assets/js/field-mapping.js` tanpa mengubah mesin render.

## Cara pakai harian
1. Buka **Buat ID Card**.
2. Unggah foto, isi **Nama**, **NIP** (sekali; otomatis tampil di depan & belakang), **Jabatan**, **Golongan Darah**.
3. Periksa preview depan/belakang. Geser foto langsung di preview atau lewat slider bila posisi wajah belum pas.
4. Unduh **PNG** (per sisi) atau **PDF**:
   - *PDF 2 halaman*: tiap halaman tepat **55 × 85 mm**, tanpa margin — untuk dicetak.
   - *PDF 1 halaman*: depan & belakang berdampingan — untuk dokumentasi/pemeriksaan.
5. Cetak pada **Actual Size / 100%**, **bukan** *Fit to Page*.

## Pertama kali: setujui posisi field (wajib)
Posisi awal foto, nama, NIP, jabatan, dan golongan darah **diukur otomatis** dari gambar ID Card jadi yang Anda unggah, lalu ditandai **Draf**. Buka **Template Designer**, periksa/geser tiap area (opsional: unggah ID Card jadi sebagai *overlay referensi*), lalu klik **Simpan & setujui posisi** untuk tiap sisi. Konfigurasi tersimpan di browser dan bertahan setelah refresh. Selama masih draf, halaman Buat ID Card menampilkan peringatan.

Satuan semua koordinat: **milimeter**, origin kiri atas, X ke kanan, Y ke bawah.

## Struktur
```
index.html
assets/css/        style.css, responsive.css
assets/js/
  field-mapping.js  registri jenis kartu, form, sumber data tunggal, validasi
  renderer.js       SATU mesin render (preview, designer, PNG, PDF) + auto-fit teks + crop foto
  template-designer.js  editor visual (drag, resize, numerik, zoom, undo/redo)
  export.js         PNG (+DPI) dan penulis PDF minimal (halaman 55×85 mm, PrintScaling=None)
  storage.js        LocalStorage (konfigurasi) + IndexedDB (foto, gambar template)
  app.js            routing, dashboard, generator, pengaturan
  default-configs.js  DIHASILKAN dari *-config.json (jangan diedit manual)
assets/templates/provinsi/  front.jpg, back.jpg, front-config.json, back-config.json
tools/build-defaults.js
tests/              renderer.test.js, export.test.js, e2e-playwright.py
```

## Menjadikan posisi yang disetujui sebagai bawaan repo
Pengaturan → **Ekspor JSON**, salin isi `front`/`back` ke `front-config.json` / `back-config.json`, lalu:
```
node tools/build-defaults.js
```

## Menjalankan lokal
Export membutuhkan origin HTTP (bukan `file://`):
```
python3 -m http.server 8765      # lalu buka http://localhost:8765
```

## Deploy ke GitHub Pages
1. Push folder ini ke repo GitHub.
2. Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
3. Buka `https://<user>.github.io/<repo>/`. File `.nojekyll` sudah disertakan; semua path relatif.

## Pengujian
```
node tests/renderer.test.js
node tests/export.test.js
python3 tests/e2e-playwright.py   # opsional, butuh Playwright + server lokal
```
Yang diuji: sinkronisasi nama/NIP, jabatan & gol. darah hanya di belakang, auto-fit & peringatan teks panjang (tidak dipotong diam-diam), foto tidak terdistorsi, MediaBox PDF 55 × 85 mm (bukan A4), DPI PNG, konfigurasi bertahan setelah refresh, undo/redo, tanpa error JS di desktop & mobile.

## Catatan teknis
- Template (JPG 653×1007 px ≈ 300 dpi) dipakai apa adanya sebagai background, tidak didesain ulang. Rasio gambar 0,6485 vs 0,6471 (55:85); gambar ditempatkan proporsional (tidak diregangkan), selisih ±0,06 mm per tepi terpotong. Bila rasio menyimpang >1%, muncul peringatan.
- Area foto di template depan (kotak ber-X) tertutup foto; bingkai hitam tetap dari template. Label, titik dua, alamat kantor, tanggal, cap, dan tanda tangan di belakang tetap dari background.
- Font: `Arial` (fallback Liberation Sans/Helvetica) dengan skala lebar huruf per field untuk meniru huruf sempit pada desain asli. Font tidak disematkan; PDF berisi gambar hasil render sehingga tampilan identik di perangkat mana pun.
- PDF memakai kompresi Flate (lossless) bila browser mendukung `CompressionStream`, selain itu JPEG kualitas 97%.
