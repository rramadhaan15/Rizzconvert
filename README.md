# Rizzconvert

Konverter gambar dan PDF yang berjalan sepenuhnya di browser. File pengguna tidak pernah diunggah ke server.

## Fitur MVP

- HEIC/HEIF ke JPG atau PNG
- PNG, JPG, dan WebP lintas format
- Gambar ke PDF
- PDF ke JPG atau PNG per halaman
- Batch conversion, progress per file, download individual, dan ZIP
- Preview file, kontrol kualitas, batas ukuran 50 MB, serta UI responsif

## Menjalankan lokal

```bash
npm install
npm run dev
```

Build produksi:

```bash
npm run build
npm run preview
```

Hasil build statis berada di `dist/` dan dapat di-host di Vercel, Netlify, atau Cloudflare Pages.

## Privasi

Semua parsing dan konversi dilakukan dengan JavaScript/WebAssembly lokal. Aplikasi tidak memiliki backend, endpoint upload, analytics, atau resource pihak ketiga saat runtime.
