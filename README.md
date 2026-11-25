# 🛡️ S.C.O.U.T. Roblox (v1.57)

**S.C.O.U.T. Roblox** is a lightweight, community-driven browser extension designed to keep Roblox players safe. It automatically scans profiles, friend networks, and community groups to detect associations with known NSFW/ERP (Erotic Roleplay) networks. 

This extension is a part of the **[S.C.O.U.T. Ecosystem](https://scout-system.onrender.com/)**.

Made by the community, for the community. Stay safe.

---
## ✨ Force push v1.56.1 to v1.57
* Change made to accomodate a critical fix to the update notifier. Only a thing in Chrome extension. No other changes done to the code.

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
Because S.C.O.U.T. is not on the Web Store, use Developer Mode:
1. **Download:** Click the green **`Code`** button at the top of this repository and select **`Download ZIP`**.
2. **Extract:** Right-click the `.zip` file and select **Extract All**.
3. **Open Settings:** Navigate to `chrome://extensions/` (or `about:addons` in Firefox).
4. **Enable Developer Mode:** Toggle the switch in the top-right corner.
5. **Load:** Click **Load unpacked** and select your extracted folder.

---

## 🔄 How to Update
When a new version is released, the extension will display an **Update Ready!** banner.
1. Click **Get Update** to download the latest `.zip`.
2. Delete your old folder and extract the new one.
3. Click the circular **Reload** icon on the S.C.O.U.T. card in your extensions manager.

---

## 🛠️ Settings & Toggles
Click the S.C.O.U.T. icon in your browser toolbar to toggle features like "Auto-Show Warnings" or "User List Badges" instantly—no refresh required!

## ⚠️ Disclaimer
By using S.C.O.U.T. extension, you automatically agree that:
* The S.C.O.U.T. database is strictly for reference purposes. It should not be a pure decision-making factor for moderation communities.
* There is a small possibility of false flags, and it may not be 100% accurate.
* You agree to not harass or target any user by weaponizing this system.
* You agree to strictly follow Roblox ToS and Community Standards.