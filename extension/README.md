# GhostWriter - LinkedIn Scraper Extension

A Chrome extension that scrapes your LinkedIn profile and saves it to your GhostWriter account.

## Setup

1. **Load the extension** (Chrome):
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

2. **Configure frontend URL** (if not using localhost):
   - Edit `popup.js` and change `DEFAULT_FRONTEND_URL` to your deployed app URL
   - Or add your domain to `content_scripts[0].matches` in `manifest.json` so the Connect button works

## Usage

1. **Sign in** on your GhostWriter frontend (the website)
2. Go to **Profile** and click **Connect Extension**
3. Open the extension popup and click **Scrape LinkedIn Profile**
4. A LinkedIn tab opens and automatically scrapes: experience → education → certifications → skills → projects
5. When done, the resume is saved to your account under `user_metadata.resume`

## Flow

- **Sign in**: Opens your frontend profile page. Sign in there first.
- **Connect Extension**: On the profile page, click "Connect Extension" to link your session to the extension.
- **Scrape**: Opens your LinkedIn profile and runs the scraper across all detail pages. Takes 1–2 minutes.

## Adding your domain

If your frontend is not on localhost, vercel.app, netlify.app, or github.io, add it to `manifest.json`:

```json
"content_scripts": [
  {
    "matches": [
      "http://localhost/*",
      "https://yourdomain.com/*"
    ],
    ...
  }
]
```
