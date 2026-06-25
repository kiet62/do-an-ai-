# Deploy LogiPort Mart

## Render

1. Tao repository moi tren GitHub va upload cac file trong thu muc nay, tru `node_modules/` va `.env`.
2. Vao Render, chon **New Web Service** va ket noi repository.
3. Render se doc `render.yaml` tu dong.
4. Neu cau hinh thu cong:
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: `Node`
   - Env vars:
     - `JWT_SECRET`: mot chuoi bi mat bat ky
     - `SQLITE_DB_PATH`: `/tmp/database.sqlite`

## Local

```bash
npm install
npm start
```

Mo `http://localhost:4000`.

Tai khoan demo:

- Admin: `admin` / `admin123`
- Nhan vien: `nhanvien` / `nv123456`
- Khach hang: `khachhang` / `kh123456`
