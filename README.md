# IoT Rain Detection Backend

Backend untuk sistem deteksi hujan berbasis IoT menggunakan Node.js, WebSocket, dan Supabase.

## Fitur

- Menerima data dari sensor hujan (ESP8266)
- Melacak durasi hujan secara real-time
- Menyimpan data history hujan di Supabase
- Komunikasi real-time menggunakan WebSocket

## Instalasi

1. Clone repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Buat file `.env` dengan konfigurasi Supabase:
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_KEY=your-supabase-anon-key
   ```
4. Jalankan server:
   ```bash
   npm start
   ```

## API Endpoints

- `POST /rain`: Menerima status hujan dari ESP8266
- `GET /history`: Mengambil history data hujan

## WebSocket

Server menyediakan WebSocket untuk komunikasi real-time dengan client.

## Setup Database

Buat tabel `rain_history` di Supabase dengan kolom:
- `id`: BIGINT, Primary Key, Auto-increment
- `start_time`: TEXT
- `end_time`: TEXT
- `duration`: INTEGER