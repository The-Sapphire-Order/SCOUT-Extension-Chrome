console.log("SCOUT Background Worker Active");

const MASTER_LIST_URL = "https://raw.githubusercontent.com/OdinsEyeRBLX/RobloxSafetyUtilities/main/FLAGGED%20ERP%20GROUPS.txt";
const CF_MAIN_NODE = "https://scout-main-node.eyesofjusticesquadrblx.workers.dev/";
const FALLBACK_API_URL = "https://fallback-node.onrender.com/fallback-check/";

// ==========================================
// 🛠️ FALLBACK SETTINGS
// Set to true to force the extension to ALWAYS use the Fallback Brain.
// Set to false for normal operation (Cloudflare primary -> Fallback on fail).
// ==========================================
const FORCE_FALLBACK_TEST = false;

let cachedFlaggedGroups = null;

// ---------------- RATE LIMIT HELPER ----------------
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    // CRITICAL FIX: Force cookies to be sent so Roblox knows we are authenticated. 
    // Without this, the /find endpoint returns an empty array.
    const fetchOptions = { credentials: "include", ...options };
    
    let attempt = 0;
    while (attempt <= maxRetries) {
        const res = await fetch(url, fetchOptions);
        if (res.ok) return res;
        
        if (res.status === 429 && attempt < maxRetries) {
            attempt++;
            const delay = Math.pow(1.5, attempt) * 1000 + Math.random() * 500;
            console.warn(`SCOUT: Roblox rate limit hit (429). Retrying in ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
        }
        throw new Error(`HTTP Error: ${res.status}`);
    }
}

// ---------------- PERMISSION CHECK SYSTEM ----------------
// Required host origins the extension needs to function.
// API permissions (storage, notifications, contextMenus) are declared in the manifest
// and are always implicitly granted by Firefox — no need to check them.
const REQUIRED_ORIGINS = [
    "https://*.roblox.com/*",
    "https://raw.githubusercontent.com/*",
    "https://scout-main-node.eyesofjusticesquadrblx.workers.dev/*",
    "https://fallback-node.onrender.com/*"
];

// Returns an array of missing origin strings, or empty array if all granted.
// NOTE: In Firefox, API permissions declared in the manifest (storage, notifications,
// contextMenus, etc.) are always implicitly granted and cannot be queried via
// permissions.contains() — it returns false for them even when active.
// Only host origins are reliably queryable, so we check those exclusively.
async function getMissingPermissions() {
    const missing = [];
    for (const origin of REQUIRED_ORIGINS) {
        const granted = await browser.permissions.contains({ origins: [origin] });
        if (!granted) missing.push(origin);
    }
    return missing;
}

// Inject the permission warning banner into a Roblox tab.
// Mirrors the visual style of showInPageUpdateBanner() in content.js.
function injectPermissionWarning(tabId, missingList) {
    const logoUrl = chrome.runtime.getURL("scout_logo.png");
    const missingText = missingList.join("<br>• ");

    chrome.scripting.executeScript({
        target: { tabId },
        func: (logoUrl, missingText) => {
            const BANNER_ID = "scout-permission-warning-banner";
            if (document.getElementById(BANNER_ID)) return;

            const banner = document.createElement("div");
            banner.id = BANNER_ID;
            banner.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background-color: #e67e22;
                color: white;
                padding: 16px 20px;
                border-radius: 8px;
                z-index: 9999999;
                font-family: 'Segoe UI', Tahoma, sans-serif;
                box-shadow: 0 8px 20px rgba(0,0,0,0.4);
                display: flex;
                flex-direction: column;
                gap: 12px;
                width: 300px;
                border: 1px solid #d35400;
            `;
            banner.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; font-weight:bold; font-size:15px;">
                    <img src="${logoUrl}" style="width:20px; height:20px;">
                    S.C.O.U.T. — Permission Warning
                </div>
                <div style="font-size:12px; line-height:1.5;">
                    The following permissions are missing. S.C.O.U.T. may not work correctly until they are granted in <b>about:addons</b>:<br><br>
                    • ${missingText}
                </div>
                <div style="display:flex; gap:10px; margin-top:4px;">
                    <button id="scout-perm-open-addons" style="background:white; color:#e67e22; border:none; padding:8px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer; flex:1;">Open Add-ons</button>
                    <button id="scout-perm-dismiss" style="background:rgba(0,0,0,0.2); color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">Dismiss</button>
                </div>
            `;
            document.body.appendChild(banner);

            document.getElementById("scout-perm-open-addons").addEventListener("click", () => {
                window.open("about:addons", "_blank");
                banner.remove();
            });
            document.getElementById("scout-perm-dismiss").addEventListener("click", () => {
                banner.remove();
            });
        },
        args: [logoUrl, missingText]
    });
}

// ---------------- CONTEXT MENU (COPY ID) ----------------
// Firefox does not support `visible: false` on contextMenus.create.
// Instead, we create the menu item on demand and remove it when not needed.
let currentContextMenuIdToCopy = null;
let contextMenuCreated = false;

chrome.runtime.onInstalled.addListener(async () => {
    // On install/update, do an immediate permission check.
    // If anything is missing, open the dedicated warning page right away
    // so the user sees it without needing to navigate to Roblox first.
    const missing = await getMissingPermissions();
    if (missing.length > 0) {
        console.warn("SCOUT: Missing permissions on install/update:", missing);
        chrome.storage.local.set({ scoutMissingPermissions: missing });
        chrome.tabs.create({ url: chrome.runtime.getURL("permission_warning.html") });
    } else {
        chrome.storage.local.set({ scoutMissingPermissions: null });
    }
});

// On every Roblox page load, re-check permissions live (not from cache).
// This ensures the banner disappears as soon as the user has granted everything,
// and keeps appearing if they are still missing something.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete") return;
    if (!tab.url || !tab.url.startsWith("https://www.roblox.com/")) return;

    const missing = await getMissingPermissions();

    // Keep storage in sync so other parts of the extension can read it.
    chrome.storage.local.set({ scoutMissingPermissions: missing.length > 0 ? missing : null });

    if (missing.length > 0) {
        injectPermissionWarning(tabId, missing);
    }
    // If nothing is missing, do nothing — no banner, no leftover UI.
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "scout-copy-id" && currentContextMenuIdToCopy) {
        chrome.tabs.sendMessage(tab.id, { action: "copyToClipboard", text: currentContextMenuIdToCopy });
    }
});

// ---------------- GROUP LIST LOADER ----------------
async function getFlaggedGroups() {
    if (cachedFlaggedGroups) return cachedFlaggedGroups;
    const res = await fetch(`${MASTER_LIST_URL}?t=${Date.now()}`);
    if (!res.ok) throw new Error("Failed to fetch list from GitHub");
    const text = await res.text();
    cachedFlaggedGroups = new Set(
        text.split(",").map(x => x.trim()).filter(x => /^\d+$/.test(x)).map(Number)
    );
    console.log(`SCOUT: Loaded ${cachedFlaggedGroups.size} groups from GitHub into memory.`);
    return cachedFlaggedGroups;
}

// ---------------- CIRCUIT BREAKER ----------------
function triggerRateLimitPause() {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    chrome.storage.local.set({ scoutLimitResetTime: tomorrow.getTime() });
    console.warn("SCOUT: Cloudflare limit hit! Circuit Breaker active until midnight.");
}

async function fetchFromFallback(userId) {
    try {
        const res = await fetch(`${FALLBACK_API_URL}${userId}`);
        if (!res.ok) return { isFlagged: false };
        const data = await res.json();
        if (data.isThreat && data.details) {
            return {
                isFlagged: true,
                status: data.details.status || "UNKNOWN",
                risk: data.details.risk || "UNKNOWN",
                created_at: data.details.created_at || new Date().toISOString()
            };
        }
        return { isFlagged: false };
    } catch (err) {
        console.error("SCOUT Fallback Error:", err);
        return { isFlagged: false };
    }
}

// ================================================================
// FRIENDS PAGINATION
// ================================================================
async function paginateFriends(userId) {
    const allIds = [];
    let cursor = null;
    let pageCount = 0;

    do {
        if (pageCount >= 20) break; // Hard cap: 20 pages × 50 = 1000

        const url = new URL(`https://friends.roblox.com/v1/users/${userId}/friends/find`);
        url.searchParams.set("userSort", "0");
        url.searchParams.set("limit", "50");
        if (cursor) url.searchParams.set("cursor", cursor); // Only set when non-null

        if (pageCount > 0) await new Promise(r => setTimeout(r, 400)); // Pace between pages
        pageCount++;

        const res = await fetchWithRetry(url.toString());
        if (!res) {
            console.warn(`SCOUT: paginateFriends page ${pageCount} failed — stopping with ${allIds.length} IDs.`);
            break;
        }

        const data = await res.json();
        const items = data.PageItems;
        if (!items || !Array.isArray(items) || items.length === 0) {
            // Empty PageItems = end of list or bad limit value
            console.log(`SCOUT: paginateFriends page ${pageCount} returned empty PageItems — done.`);
            break;
        }

        for (const item of items) {
            if (item.id) allIds.push(item.id);
        }

        // NextCursor (capital N) — this is the correct field per official Roblox docs
        cursor = data.NextCursor || null;

        console.log(`SCOUT: Friends page ${pageCount}: +${items.length} IDs (total: ${allIds.length}), next: ${cursor ? 'yes' : 'none'}`);

    } while (cursor);

    console.log(`SCOUT: paginateFriends complete — ${allIds.length} total friends for user ${userId}`);
    return allIds;
}

// ================================================================
// BULK BANNED CHECK
// ================================================================
async function bulkCheckBanned(userIds) {
    let terminatedCount = 0;
    const chunkSize = 100;

    for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize);
        const res = await fetchWithRetry("https://users.roblox.com/v1/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userIds: chunk, excludeBannedUsers: false })
        });

        if (res) {
            try {
                const data = await res.json();
                if (data.data && Array.isArray(data.data)) {
                    for (const user of data.data) {
                        if (user.isBanned) terminatedCount++;
                    }
                }
            } catch (e) {
                console.warn(`SCOUT: bulkCheckBanned JSON parse error chunk ${i / chunkSize + 1}`);
            }
        } else {
            console.warn(`SCOUT: bulkCheckBanned chunk ${i / chunkSize + 1} failed, skipping.`);
        }

        if (i + chunkSize < userIds.length) await new Promise(r => setTimeout(r, 300));
    }

    return terminatedCount;
}

// ================================================================
// FAST MESSAGE HANDLERS (short-lived, safe for sendMessage)
// ================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateContextMenu") {
        currentContextMenuIdToCopy = request.idToCopy;
        const title = `Copy ${request.type.charAt(0).toUpperCase() + request.type.slice(1)} ID`;
        if (contextMenuCreated) {
            chrome.contextMenus.update("scout-copy-id", { title });
        } else {
            chrome.contextMenus.create({
                id: "scout-copy-id",
                title,
                contexts: ["all"],
                documentUrlPatterns: ["*://*.roblox.com/*"]
            });
            contextMenuCreated = true;
        }
        sendResponse({ success: true });
        return true;
    }
    if (request.action === "hideContextMenu") {
        currentContextMenuIdToCopy = null;
        if (contextMenuCreated) {
            chrome.contextMenus.remove("scout-copy-id", () => {
                contextMenuCreated = false;
            });
        }
        sendResponse({ success: true });
        return true;
    }
    if (request.action === "checkUser") {
        handleCheckUser(request.userId).then(sendResponse);
        return true;
    }
    if (request.action === "checkGroup") {
        handleCheckGroup(request.groupId).then(sendResponse);
        return true;
    }
    if (request.action === "checkDatabase") {
        handleCheckDatabase(request.userId).then(sendResponse);
        return true;
    }
    if (request.action === "checkFallbackBrain") {
        fetchFromFallback(request.userId).then(sendResponse);
        return true;
    }
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "scout-long-scan") return;

    port.onMessage.addListener(async (request) => {
        try {
            if (request.action === "checkTerminatedFriends") {
                const result = await handleTerminatedFriends(request.userId);
                port.postMessage({ action: "checkTerminatedFriends", result });
            } else if (request.action === "getFriendsList") {
                const result = await handleGetFriendsList(request.userId);
                port.postMessage({ action: "getFriendsList", result });
            }
        } catch (err) {
            console.error("SCOUT long-scan port error:", err);
            port.postMessage({ action: request.action, result: { error: err.message } });
        }
    });
});

// ================================================================
// HANDLER IMPLEMENTATIONS
// ================================================================

async function handleCheckUser(userId) {
    try {
        const flaggedGroups = await getFlaggedGroups();
        const groupRes = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
        if (!groupRes.ok) throw new Error("Roblox Group API Limit");

        const groupData = await groupRes.json();
        const userGroups = groupData.data || [];
        let flaggedCount = 0;
        for (const g of userGroups) {
            if (flaggedGroups.has(g.group.id)) flaggedCount++;
        }

        if (flaggedCount >= 5) {
            const limitData = await chrome.storage.local.get(['scoutLimitResetTime']);
            const now = Date.now();
            if (FORCE_FALLBACK_TEST) {
                console.warn(`[DEBUG] FORCE_FALLBACK_TEST active — skipping shadow scan for ${userId}.`);
            } else if (limitData.scoutLimitResetTime && now < limitData.scoutLimitResetTime) {
                console.warn(`SCOUT: Skipping shadow scan for ${userId} (Circuit Breaker Active)`);
            } else {
                fetch(CF_MAIN_NODE, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: parseInt(userId) })
                }).then(res => {
                    if (res.status === 429) triggerRateLimitPause();
                }).catch(() => {});
            }
        }

        let riskLevel = "safe";
        if (flaggedCount >= 10) riskLevel = "high";
        else if (flaggedCount >= 5) riskLevel = "medium";
        else if (flaggedCount > 0) riskLevel = "low";

        return { flaggedGroupCount: flaggedCount, risk: riskLevel };
    } catch (err) {
        return { error: err.message };
    }
}

// ---------------- NEW FRIENDS API (1000 LIMIT) ----------------
async function handleGetFriendsList(userId) {
    try {
        let allFriends = [];
        let cursor = "";
        let pageCount = 0;

        do {
            if (pageCount >= 20) break; // Hard cap at 1000 users (20 pages * 50)
            pageCount++;

            const url = new URL(`https://friends.roblox.com/v1/users/${userId}/friends/find`);
            // STRICTLY limit=50. Added userSort=0 causes 400 Bad Request.
            url.searchParams.append("limit", "50");
            if (cursor) url.searchParams.append("cursor", cursor);
            
            if (pageCount > 1) await new Promise(r => setTimeout(r, 400));

            const res = await fetchWithRetry(url.toString());
            const data = await res.json();
            const items = data.PageItems || data.data || [];
            allFriends.push(...items);
            
            cursor = data.NextCursor || data.nextPageCursor;
            
        } while (cursor && allFriends.length < 1000); 
        
        return { friends: allFriends };
    } catch (err) {
        console.error("SCOUT Friends Fetch Error:", err);
        return { error: err.message };
    }
}

// ---------------- TERMINATED FRIENDS SCANNER ----------------
async function handleTerminatedFriends(userId) {
    try {
        let allFriends = [];
        let cursor = "";
        let pageCount = 0;

        do {
            if (pageCount >= 20) break;
            pageCount++;

            const url = new URL(`https://friends.roblox.com/v1/users/${userId}/friends/find`);
            url.searchParams.append("limit", "50");
            if (cursor) url.searchParams.append("cursor", cursor);
            
            if (pageCount > 1) await new Promise(r => setTimeout(r, 400));

            const friendsRes = await fetchWithRetry(url.toString());
            const friendsData = await friendsRes.json();
            
            const items = friendsData.PageItems || friendsData.data || [];
            allFriends.push(...items);
            
            cursor = friendsData.NextCursor || friendsData.nextPageCursor;
            
        } while (cursor && allFriends.length < 1000);

        if (allFriends.length === 0) return { terminatedCount: 0 };

        let terminatedCount = 0;
        const chunkSize = 10;
        
        for (let i = 0; i < allFriends.length; i += chunkSize) {
            const chunk = allFriends.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (friend) => {
                try {
                    const targetId = friend.id || friend.friendId; 
                    if (!targetId) return;

                    const userRes = await fetch(`https://users.roblox.com/v1/users/${targetId}`);
                    if (!userRes.ok) return;
                    
                    const userData = await userRes.json();
                    if (userData.isBanned) {
                        terminatedCount++;
                    }
                } catch (e) {
                }
            }));
            
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        return { terminatedCount };
    } catch (err) {
        console.error("SCOUT Terminated Friends Error:", err);
        return { error: err.message };
    }
}

async function handleCheckGroup(groupId) {
    try {
        const flaggedGroups = await getFlaggedGroups();
        return { isFlagged: flaggedGroups.has(parseInt(groupId)) };
    } catch (err) {
        return { error: err.message };
    }
}

async function handleCheckDatabase(userId) {
    try {
        if (FORCE_FALLBACK_TEST) {
            console.warn(`[DEBUG] FORCE_FALLBACK_TEST — routing to fallback for ${userId}.`);
            return await fetchFromFallback(userId);
        }
        const limitData = await chrome.storage.local.get(['scoutLimitResetTime']);
        if (limitData.scoutLimitResetTime && Date.now() < limitData.scoutLimitResetTime) {
            return await fetchFromFallback(userId);
        }

        const res = await fetch(CF_MAIN_NODE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "check_db", userId: parseInt(userId) })
        });
        if (res.status === 429) {
            triggerRateLimitPause();
            return await fetchFromFallback(userId);
        }
        if (!res.ok) return { isFlagged: false };

        const data = await res.json();
        return {
            isFlagged: data.isDangerous,
            status: data.status,
            risk: data.risk,
            created_at: data.created_at
        };
    } catch (err) {
        console.error("SCOUT DB Check Error:", err);
        return { isFlagged: false };
    }
}