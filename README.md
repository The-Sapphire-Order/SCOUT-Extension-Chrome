# 🛡️ S.C.O.U.T. Roblox (v1.56.1) [For Mozilla Firefox]

**S.C.O.U.T. Roblox** is a lightweight, community-driven browser extension designed to keep Roblox players safe. It automatically scans profiles, friend networks, and community groups to detect associations with known NSFW/ERP (Erotic Roleplay) networks. 

This extension is a part of the **[S.C.O.U.T. Ecosystem](https://scout-system.onrender.com/)**.

Made by the community, for the community. Stay safe.

---

## ✨ New in v1.56.1
* **Updated Friends Scanning**: Scan to find friends of a user found in the database is now manual via a "scan" button. This is done to avoid API traffic as well as improve extension performance slightly on lower browser versions. This can be set to automatic again via the settings menu.
* **Updated Settings UI:** Updated UI for settings to be more neat and understandable.

## ✨ Core Features
* **Main Profile Scanning:** Safety rating badges displayed directly on profile headers.
* **Intelligent Network Scanner:** Automatically detects flagged users within a target's friend list.
* **Dangerous User Warning:** Global warning system for users logged as "Dangerous" by the S.C.O.U.T. autonomous system.
* **Threat Intelligence Pop-ups:** Get detailed reports on detection vectors (Manual, Pulse Crawl, Deep Crawl) on demand.
* **Utility Tool**: Right-click to copy IDs for Users, Groups, Games, and Assets.

---

## 🛠️ Technical Upgrades (v1.55.0 - v1.56.0)
* **API Scaling:** Switched to the `/friends/find` paginated endpoint to support up to 1,000 friends, ensuring deep network transparency.
* **Circuit Breaker & Fallback:** Integrated a robust retry-with-backoff system and a secondary Render-hosted fallback node to bypass Cloudflare rate limits during heavy network scans.

---

## 🔒 Privacy & Safety Guarantee
1. **Zero Personal Data Collection:** The extension only reads public Roblox User IDs visible on your screen.
2. **No Authentication Access:** S.C.O.U.T. does not require or access your `.ROBLOSECURITY` cookie.
3. **100% Local Processing:** Cross-referencing and math are performed locally in your browser memory.
4. **Open Source:** Every line of code is completely public in this repository. You can verify exactly what it does before installing it.

---

## ⚙️ How to Install
Visit the official Mozilla extension store and download the extension for **Firefox** (PC devices only): **https://addons.mozilla.org/en-US/firefox/addon/scout-roblox/**

---

## 🔄 How to Update
* Within Firefox, go to Extensions -> Manage Extensions, and look for **S.C.O.U.T. Roblox**, check the three dots, and click **Manage**.
* From there, click the **Settings icon** visible in the top right of the card, and select **Check for updates**, it should automatically detect and update if there is a new verison.
* It is recommended to select "Allow automatic updates" as **On** so you don't have to repeat this process over and over every update.

---

## 🛠️ Settings & Toggles
Click the S.C.O.U.T. icon in your browser toolbar to toggle features like "Auto-Show Warnings" or "User List Badges" instantly—no refresh required!

## ⚠️ Disclaimer
By using S.C.O.U.T. extension, you automatically agree that:
* The S.C.O.U.T. database is strictly for reference purposes. It should not be a pure decision-making factor for moderation communities.
* There is a small possibility of false flags, and it may not be 100% accurate.
* You agree to not harass or target any user by weaponizing this system.
* You agree to strictly follow Roblox ToS and Community Standards.