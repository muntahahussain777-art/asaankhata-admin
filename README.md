# AsaanKhata VIP Admin (GitHub Pages)

Standalone web admin — **mobile admin panel jaisi sab features**, PC par full screen.

## GitHub par deploy (bina domain/hosting)

### Option A — Same repo (`admin-web` folder)

1. GitHub repo → **Settings** → **Pages**
2. Source: **Deploy from branch** → `main` → folder **`/admin-web`**
3. URL: `https://YOUR_USERNAME.github.io/asaankhata/`  
   (agar `admin-web/index.html` root nahi hai to path check karein)

### Option B — Sirf admin repo (recommended)

1. Naya repo banao: `asaankhata-admin`
2. `admin-web` folder ki **saari files** repo **root** mein copy karo (`index.html` root par)
3. Pages ON → `https://YOUR_USERNAME.github.io/asaankhata-admin/`

## Pehli dafa setup

1. Website kholo
2. **Supabase URL** + **Anon Key** (app wala same)
3. **Admin PIN** set karo (mobile admin jaisa — min 6 chars)
4. Data localStorage mein **hash** form mein save — GitHub par PIN commit mat karo

## Features (mobile admin = web admin)

| Section | Kaam |
|---------|------|
| Dashboard | Total / Pro / Free stats |
| Users | Search, Pro / Pro+ / Enterprise assign, revoke, delete |
| Pending | Easypaisa payments approve |
| Google Play | Recent purchases view |
| PRO Trial | Campaign on/off, hours, audience |
| Ads | Remote home banner |
| AI | Provider, model, API key, limits |
| OTP | Global on/off |
| YouTube | 11 screen help links |
| Notifications | Create broadcast |

## Security

- PIN **SHA-256 hash** — plaintext save nahi
- Session **2 hours** — phir dubara PIN
- **5 galat PIN** = 15 min lock
- Account delete = PIN dubara + confirm
- `noindex` — search engines block
- **Tip:** Private GitHub repo use karein agar URL public na ho

## Supabase SQL (agar pehle nahi chala)

```sql
-- notifications table (agar missing ho)
-- File: supabase_notifications_migration.sql
```

## App change?

**Nahi** — yeh sirf static website hai. App same Supabase se sync karti hai.

## Pro Code note

Mobile admin mein Pro Code **device local** hai. Cloud plans yahan **Users** se assign karein (`plan_type` + `pro_subscriptions`).
