# Citizen App (React Native / Expo)

Phase 2 of the build: the mobile app citizens use to report a fire.
Captures location, lets them pick a category, and submits to the backend.

## Prerequisites

- Your Phase 1 backend already running (`npm run dev` in the `backend` folder)
- **Expo Go** app installed on your phone (Play Store / App Store — free)
- Your phone and PC connected to **the same Wi-Fi network**

## Step 1 — Find your PC's local IP address

Your phone can't reach `localhost` — that means "the phone itself" on a phone.
You need your PC's actual network IP.

On Windows, open PowerShell and run:
```powershell
ipconfig
```
Look for **"IPv4 Address"** under your active adapter (usually "Wireless LAN adapter Wi-Fi").
It'll look like `192.168.1.42` or `10.0.0.15`.

## Step 2 — Update the API URL

Open `api.js` in this folder and replace:
```js
const API_BASE_URL = 'http://YOUR_PC_LOCAL_IP:4000/api';
```
with your actual IP, e.g.:
```js
const API_BASE_URL = 'http://192.168.1.42:4000/api';
```

## Step 3 — Install dependencies

```powershell
npm install
```

## Step 4 — Start Expo

```powershell
npm start
```

A QR code will appear in your terminal.

## Step 5 — Open on your phone

1. Open the **Expo Go** app on your phone
2. Scan the QR code (Android: use Expo Go's built-in scanner; iOS: use the Camera app, it'll prompt to open in Expo Go)
3. The app should load — you'll see the "Report a Fire" screen

## Step 6 — Test it

1. Tap a fire category
2. Tap "Capture My Location" — grant location permission when prompted
3. Optionally add a description
4. Tap "Submit Report"

If it works, you'll see a confirmation screen with a reference ID.
Check your backend terminal — you should see the request come through, and
if you run `Invoke-RestMethod http://localhost:4000/api/incidents` in a
second PowerShell window on your PC, the new report should appear.

## Troubleshooting

- **"Network request failed" / can't submit** — almost always the IP in
  `api.js` is wrong, or your phone isn't on the same Wi-Fi as your PC. Some
  routers isolate devices from each other ("AP isolation") — if it still
  fails after fixing the IP, that's the next thing to check.
- **Windows Firewall blocking it** — Windows may prompt to allow Node.js
  through the firewall the first time the backend starts accepting outside
  connections. Click "Allow access" if prompted.
- **QR code won't scan** — make sure your terminal window is wide enough
  to render it without cutting off, or press `w` in the Expo terminal to
  open the web version as a quick sanity check instead.

## Next steps

- Phase 3: Wire Socket.IO into a live dispatcher dashboard
- Phase 4: Dispatcher dashboard (React web) with map view
- Phase 5: Responder app
