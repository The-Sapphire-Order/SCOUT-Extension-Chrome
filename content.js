console.log("SCOUT extension active");

const apiCache = new Map();
const termCache = new Map(); 
const processedListUsers = new Set();
let settings = { 
    mainBadgeEnabled: true, 
    listBadgeEnabled: true, 
    termBadgeEnabled: true, 
    groupBadgeEnabled: true,
    autoGroupPopupEnabled: true, 
    autoPopupEnabled: true,
    autoScanEnabled: false // Friends scan runs only on click unless this is ON
};

// Per-profile state for the manual friends scan (so the 2s refresh loop never re-fires requests)
const manualScanUsers = new Set();   // userIds whose scan the user has clicked
const flaggedScanResults = new Map(); // userId -> { flagged, total } once a scan finishes

// ---------------- CONTEXT MENU ID EXTRACTOR ----------------
document.addEventListener("mousedown", (e) => {
    if (e.button !== 2) return; 

    let idToCopy = null;
    let type = null;
    const link = e.target.closest('a');
    if (link && link.href) {
        const matchUser = link.href.match(/\/users\/(\d+)/);
        const matchGroup = link.href.match(/\/(?:groups|communities)\/(\d+)/);
        const matchGame = link.href.match(/\/games\/(\d+)/);
        const matchAsset = link.href.match(/\/(?:catalog|library|bundles)\/(\d+)/);

        if (matchUser) { type = 'user'; idToCopy = matchUser[1]; }
        else if (matchGroup) { type = 'group'; idToCopy = matchGroup[1]; }
        else if (matchGame) { type = 'game'; idToCopy = matchGame[1]; }
        else if (matchAsset) { type = 'asset'; idToCopy = matchAsset[1]; }
    }
    if (!idToCopy) {
        const path = window.location.href;
        const matchUser = path.match(/\/users\/(\d+)/);
        const matchGroup = path.match(/\/(?:groups|communities)\/(\d+)/);
        const matchGame = path.match(/\/games\/(\d+)/);
        const matchAsset = path.match(/\/(?:catalog|library|bundles)\/(\d+)/);

        if (matchUser) { type = 'user'; idToCopy = matchUser[1]; }
        else if (matchGroup) { type = 'group'; idToCopy = matchGroup[1]; }
        else if (matchGame) { type = 'game'; idToCopy = matchGame[1]; }
        else if (matchAsset) { type = 'asset'; idToCopy = matchAsset[1]; }
    }
    if (idToCopy && type) {
        chrome.runtime.sendMessage({ action: "updateContextMenu", type: type, idToCopy: idToCopy });
    } else {
        chrome.runtime.sendMessage({ action: "hideContextMenu" });
    }
});

// --- READ SETTINGS AND CHECK FOR UPDATES ---
chrome.storage.local.get([
    'mainBadgeEnabled', 
    'listBadgeEnabled', 
    'termBadgeEnabled', 
    'groupBadgeEnabled', 
    'autoPopupEnabled',
    'autoGroupPopupEnabled', 
    'autoScanEnabled',
    'updateAvailable',
    'scoutTcAccepted'
], (result) => {
    if (result.mainBadgeEnabled !== undefined) settings.mainBadgeEnabled = result.mainBadgeEnabled;
    if (result.listBadgeEnabled !== undefined) settings.listBadgeEnabled = result.listBadgeEnabled;
    if (result.termBadgeEnabled !== undefined) settings.termBadgeEnabled = result.termBadgeEnabled;
    if (result.groupBadgeEnabled !== undefined) settings.groupBadgeEnabled = result.groupBadgeEnabled;
    if (result.autoGroupPopupEnabled !== undefined) settings.autoGroupPopupEnabled = result.autoGroupPopupEnabled;
    if (result.autoPopupEnabled !== undefined) settings.autoPopupEnabled = result.autoPopupEnabled;
    if (result.autoScanEnabled !== undefined) settings.autoScanEnabled = result.autoScanEnabled;
    if (settings.autoScanEnabled) removeIdleScanButtons();
    if (!result.scoutTcAccepted) {
        showTermsAndConditions();
    }
    
    if (result.updateAvailable) showInPageUpdateBanner();
    setTimeout(() => {
        processMainProfile();
        processGroupPage(); 
        processCommunitySearch();
        processListLinks();
    }, 100);
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.mainBadgeEnabled) {
        settings.mainBadgeEnabled = changes.mainBadgeEnabled.newValue;
        if (!settings.mainBadgeEnabled) removeMainBadge();
    }
    if (changes.listBadgeEnabled) {
        settings.listBadgeEnabled = changes.listBadgeEnabled.newValue;
        if (!settings.listBadgeEnabled) removeListBadges();
    }
    if (changes.termBadgeEnabled) {
        settings.termBadgeEnabled = changes.termBadgeEnabled.newValue;
        if (!settings.termBadgeEnabled) removeTermBadge();
    }
    if (changes.groupBadgeEnabled) {
        settings.groupBadgeEnabled = changes.groupBadgeEnabled.newValue;
        if (!settings.groupBadgeEnabled) removeGroupBadge();
    }
    if (changes.autoGroupPopupEnabled) {
    settings.autoGroupPopupEnabled = changes.autoGroupPopupEnabled.newValue;
    }
    if (changes.autoPopupEnabled) {
        settings.autoPopupEnabled = changes.autoPopupEnabled.newValue;
    }
    if (changes.autoScanEnabled) {
        settings.autoScanEnabled = changes.autoScanEnabled.newValue;
        if (settings.autoScanEnabled) removeIdleScanButtons();
    }
    if (changes.updateAvailable && changes.updateAvailable.newValue === true) {
        showInPageUpdateBanner();
    }
});

// ---------------- IN-PAGE UPDATE BANNER ----------------
function showInPageUpdateBanner() {
    if (document.getElementById('scout-inpage-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'scout-inpage-update-banner';
    banner.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #e74c3c;
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        z-index: 9999999; 
        font-family: 'Segoe UI', Tahoma, sans-serif;
        box-shadow: 0 8px 20px rgba(0,0,0,0.4);
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 280px;
        border: 1px solid #c0392b;
    `;

    banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; font-weight: bold; font-size: 16px;">
            <img src="${chrome.runtime.getURL('scout_logo.png')}" style="width: 20px; height: 20px;">
            S.C.O.U.T. Update Ready!
        </div>
        <div style="font-size: 13px; line-height: 1.4;">
            A new version of S.C.O.U.T. is available. Please download the update to stay protected.
        </div>
        <div style="display: flex; gap: 10px; margin-top: 5px;">
            <button id="scout-update-download" style="background: white; color: #e74c3c; border: none; padding: 8px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer; flex: 1; transition: 0.2s;">Get Update</button>
            <button id="scout-update-dismiss" style="background: rgba(0,0,0,0.2); color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; transition: 0.2s;">Dismiss</button>
        </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('scout-update-download').addEventListener('click', () => {
        window.open("https://github.com/The-Sapphire-Order/SCOUT-Extension-Chrome", "_blank");
        window.location.href = "https://github.com/The-Sapphire-Order/SCOUT-Extension-Chrome/archive/refs/heads/main.zip";
        banner.remove(); 
    });

    document.getElementById('scout-update-dismiss').addEventListener('click', () => {
        banner.remove();
    });
}

// ---------------- TERMS AND CONDITIONS MODAL ----------------
function showTermsAndConditions() {
    if (document.getElementById('scout-tnc-modal')) return;

    const overlay = document.createElement("div");
    overlay.id = "scout-tnc-modal";
    overlay.className = "scout-modal-overlay scout-visible"; 
    overlay.style.zIndex = "99999999";

    overlay.innerHTML = `
        <div class="scout-modal-box" onclick="event.stopPropagation()">
            <div class="scout-modal-header">
                <img src="${chrome.runtime.getURL('scout_logo.png')}" style="width: 24px; height: 24px;">
                <h3 class="scout-modal-title" style="color: #f39c12;">S.C.O.U.T. Disclaimer</h3>
            </div>
            <div class="scout-modal-section">
                <div class="scout-modal-desc" style="color: #d0d0dc; font-size: 13px; line-height: 1.6;">
                    By using S.C.O.U.T., you agree to the following terms:
                    <ul style="margin-top: 8px; padding-left: 20px; color: #f0f0f5; text-align: left;">
                        <li>The S.C.O.U.T. database is strictly for reference purposes. It should not be a pure decision-making factor for moderation communities.</li>
                        <li>There is a small possibility of false flags, and it may not be 100% accurate.</li>
                        <li>You agree to not harass or target any user by weaponizing this system.</li>
                        <li>You agree to strictly follow Roblox ToS and Community Standards.</li>
                    </ul>
                </div>
            </div>
            <button class="scout-modal-close" id="scout-tnc-accept-btn" style="background: #2ecc71;">I Accept & Understand</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('scout-tnc-accept-btn').addEventListener('click', () => {
        chrome.storage.local.set({ scoutTcAccepted: true }, () => {
            overlay.classList.remove("scout-visible");
            setTimeout(() => overlay.remove(), 200);
        });
    });
}

// --- CLEANUP FUNCTIONS ---
function removeMainBadge() {
    const badge = document.querySelector('.scout-dynamic-badge');
    if (badge) badge.remove();
}

function removeListBadges() {
    dynamicStyleTag.innerHTML = "";
    processedListUsers.clear();
    document.querySelectorAll('.scout-list-warning').forEach(icon => icon.remove());
    document.querySelectorAll('[data-scout-warning-processed]').forEach(el => {
        el.removeAttribute('data-scout-warning-processed');
    });
}

// Swap any idle "Scan" buttons out so the next refresh tick auto-scans (used when auto-scan is ON)
function removeIdleScanButtons() {
    document.querySelectorAll('.scout-network-scanner[data-scout-state="idle"]').forEach(el => {
        const host = el.parentElement;
        if (host) delete host.dataset.scoutNetworkScanner;
        el.remove();
    });
}

function removeTermBadge() {
    const badge = document.getElementById("scout-term-badge");
    if (badge) badge.remove();
}

function removeGroupBadge() {
    const badge = document.querySelector('.scout-group-badge');
    if (badge) badge.remove();
    const groupNameEl = document.querySelector(".profile-header-details-community-name");
    if (groupNameEl) delete groupNameEl.dataset.scoutProcessing;
}

// --- GLOBAL SETUP ---
document.documentElement.style.setProperty('--scout-logo-url', `url('${chrome.runtime.getURL("scout_logo.png")}')`);

let dynamicStyleTag = document.getElementById("scout-dynamic-styles");
if (!dynamicStyleTag) {
    dynamicStyleTag = document.createElement("style");
    dynamicStyleTag.id = "scout-dynamic-styles";
    document.head.appendChild(dynamicStyleTag);
}

function getUserIdFromUrl() {
    const match = location.pathname.match(/\/users\/(\d+)/);
    return match ? match[1] : null;
}

function getGroupIdFromUrl() {
    const match = location.pathname.match(/\/(communities|groups)\/(\d+)/);
    return match ? match[2] : null;
}

// Fetchers
async function fetchScoutData(userId) {
    if (apiCache.has(userId)) return apiCache.get(userId);
    const fetchPromise = new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "checkUser", userId: userId }, (response) => {
            if (chrome.runtime.lastError || response.error) {
                apiCache.delete(userId); resolve(null);
            } else { resolve(response); }
        });
    });
    apiCache.set(userId, fetchPromise);
    return fetchPromise;
}

async function fetchDatabaseData(userId) {
    const cacheKey = `db_${userId}`;
    if (apiCache.has(cacheKey)) return apiCache.get(cacheKey);
    const fetchPromise = new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "checkDatabase", userId: userId }, (response) => {
            if (chrome.runtime.lastError || !response) {
                apiCache.delete(cacheKey); resolve({ isFlagged: false });
            } else { resolve(response); }
        });
    });
    apiCache.set(cacheKey, fetchPromise);
    return fetchPromise;
}

// Uses a long-lived port to keep the service worker alive during slow scans (30-60s for 1000 friends).
// chrome.runtime.sendMessage closes the response channel if the worker goes idle mid-await;
// a persistent port does not.
function scoutLongScan(action, payload) {
    return new Promise((resolve) => {
        let port;
        try {
            port = chrome.runtime.connect({ name: "scout-long-scan" });
        } catch (e) {
            resolve(null);
            return;
        }
        const timeout = setTimeout(() => {
            try { port.disconnect(); } catch (_) {}
            resolve(null);
        }, 120000); // 2-minute hard cap — enough for 1000 friends at 300ms chunks

        port.onMessage.addListener((msg) => {
            if (msg.action === action) {
                clearTimeout(timeout);
                try { port.disconnect(); } catch (_) {}
                resolve(msg.result && !msg.result.error ? msg.result : null);
            }
        });
        port.onDisconnect.addListener(() => {
            clearTimeout(timeout);
            resolve(null);
        });
        port.postMessage({ action, ...payload });
    });
}

async function fetchTerminatedData(userId) {
    if (termCache.has(userId)) return termCache.get(userId);
    const fetchPromise = scoutLongScan("checkTerminatedFriends", { userId });
    termCache.set(userId, fetchPromise);
    return fetchPromise;
}

async function fetchFriendsList(userId) {
    return scoutLongScan("getFriendsList", { userId });
}

async function fetchGroupData(groupId) {
    const cacheKey = `group_${groupId}`;
    if (apiCache.has(cacheKey)) return apiCache.get(cacheKey);
    const fetchPromise = new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "checkGroup", groupId: groupId }, (response) => {
            if (chrome.runtime.lastError || !response || response.error) {
                apiCache.delete(cacheKey); resolve(null);
            } else { resolve(response); }
        });
    });
    apiCache.set(cacheKey, fetchPromise);
    return fetchPromise;
}

async function fetchFallbackData(userId) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "checkFallbackBrain", userId: userId }, (response) => {
            if (chrome.runtime.lastError || !response) {
                resolve({ isFlagged: false });
            } else { resolve(response); }
        });
    });
}

async function showScoutIntelligenceModal(userId, status, risk, created_at) {
    if (document.getElementById('scout-intel-modal')) return;

    let formattedDate = "Logged on or before 20th April 2026 on an older S.C.O.U.T. version.";
    
    if (created_at) {
        let safeDate = created_at;
        if (typeof safeDate === 'string') {
            safeDate = safeDate.replace(' ', 'T');
            if (!safeDate.includes('Z') && !safeDate.includes('+')) {
                safeDate += 'Z'; 
            }
        }

        const dateObj = new Date(safeDate);
        const legacyThreshold = new Date("2026-04-20T16:15:00Z");
        
        if (dateObj > legacyThreshold) {
            formattedDate = new Intl.DateTimeFormat('en-US', {
                hour: '2-digit', minute: '2-digit', hour12: true,
                day: 'numeric', month: 'long', year: 'numeric'
            }).format(dateObj);
        }
    }

    const statusDefs = {
        "SHADOW_SCAN": "<b>This user very likely is or was a part of the inappropriate/NSFW Roblox account network.</b><br>Flagged instantly by SCOUT's automated security grid. This detection is highly reliable, calculated using a strict mathematical formula that analyzes the user's active networks and group intersections.<br><b>Exercise extreme caution around this profile.</b>",
        "PULSE_CRAWL": "<b>This user very likely is or was a part of the inappropriate/NSFW Roblox account network.</b><br>Flagged by SCOUT's background pulse scans. This is a highly accurate detection driven by a mathematical risk formula that constantly monitors and cross-references known dangerous networks.<br><b>Exercise extreme caution around this profile.</b>",
        "DEEP_CRAWL": "<b>This user very likely is or was a part of the inappropriate/NSFW Roblox account network.</b><br>Flagged by SCOUT's heavy Deep Crawler. This system mathematically spider-webs through the connections of known threats to uncover hidden networks, making this a highly reliable detection.<br><b>Exercise extreme caution around this profile.</b>",
        "MANUAL": "Manually investigated and flagged by a S.C.O.U.T. Administrator using verified evidence.<br><b>Exercise extreme caution around this profile.</b>",
        "SCAM": "Manually investigated and flagged by a S.C.O.U.T. Administrator for involvement in scam networks (e.g., account theft, Robux scams, off-platform phishing).<br><b>Exercise extreme caution around this profile.</b>"
    };

    const riskDefs = {
        "CLOTHING": "User was involved with creating inappropriate fetish/kink clothing.",
        "ACTIVITY": "User was witnessed involving themselves fully with inappropriate networks and conduct.",
        "BIO": "User was found having an extremely inappropriate description, linking themselves to inappropriate networks.",
        "ASSETS": "User was found to be the owner/creator of inappropriate/NSFW assets on Roblox (audio, meshes, images, etc).",
        "SCAM": "User was manually flagged for involvement in scam networks (e.g., account theft, Robux scams, off-platform phishing)."
    };

    const displayStatus = status || "UNKNOWN";
    const statusDesc = statusDefs[displayStatus] || "Detected through legacy or unknown S.C.O.U.T. protocols.";

    const overlay = document.createElement("div");
    overlay.id = "scout-intel-modal";
    overlay.className = "scout-modal-overlay";

    let riskHtml = "";
    if (displayStatus === "MANUAL") {
        const isModernTag = risk && riskDefs[risk];
        const displayRisk = isModernTag ? risk : "LEGACY";
        const displayRiskDesc = isModernTag 
            ? riskDefs[risk] 
            : "User was manually flagged in an older version of S.C.O.U.T. before structured violation tags were introduced. Threat remains verified.";

        riskHtml = `
            <div class="scout-modal-section">
                <div class="scout-modal-label">Violation Keyword</div>
                <div class="scout-modal-value" style="color: #e67e22;">${displayRisk}</div>
                <div class="scout-modal-desc">${displayRiskDesc}</div>
            </div>
        `;
    }

    overlay.innerHTML = `
        <div class="scout-modal-box" onclick="event.stopPropagation()">
            <div class="scout-modal-header">
                <img src="${chrome.runtime.getURL('scout_logo.png')}" style="width: 24px; height: 24px;">
                <h3 class="scout-modal-title">Threat Intelligence Report</h3>
            </div>
            <div class="scout-modal-section">
                <div class="scout-modal-label">Target Profile</div>
                <div class="scout-modal-value" id="scout-modal-target-username">Loading Username...</div>
            </div>
            <div class="scout-modal-section">
                <div class="scout-modal-label">Detection Vector</div>
                <div class="scout-modal-value" style="color: #e74c3c;">${displayStatus}</div>
                <div class="scout-modal-desc">${statusDesc}</div>
            </div>
            ${riskHtml}
            <div class="scout-modal-section" style="margin-bottom: 0; border-top: 1px solid #3a3a48; padding-top: 12px; margin-top: 16px;">
                <div class="scout-modal-label">Date Logged</div>
                <div class="scout-modal-desc" style="color: #a0a0b0; font-family: monospace;"><b>${formattedDate}</b></div>
            </div>
            <button class="scout-modal-close" id="scout-modal-close-btn">Acknowledge</button>
        </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("scout-visible"));
    try {
        const uRes = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        if (uRes.ok) {
            const uData = await uRes.json();
            const nameEl = document.getElementById("scout-modal-target-username");
            if (nameEl) nameEl.textContent = `@${uData.name}`;
        }
    } catch(e) {
        const nameEl = document.getElementById("scout-modal-target-username");
        if (nameEl) nameEl.textContent = "Unknown User";
    }

    const closeModal = () => {
        overlay.classList.remove("scout-visible");
        setTimeout(() => overlay.remove(), 200);
    };

    document.getElementById("scout-modal-close-btn").addEventListener("click", closeModal);
    overlay.addEventListener("click", closeModal);
}

// ---------------- MAIN PROFILE BADGE ----------------
function createMainProfileBadge(data, dbData) {
    const count = data ? (data.flaggedGroupCount || 0) : 0;
    const badge = document.createElement("span");
    badge.className = "scout-badge scout-dynamic-badge";
    
    const logo = document.createElement("img");
    logo.src = chrome.runtime.getURL("scout_logo.png");
    logo.className = "scout-logo";
    badge.appendChild(logo);

    const textSpan = document.createElement("span");
    if (dbData && dbData.isFlagged) {
        if (dbData.risk === "SCAM") {
            badge.classList.add("scout-scam-warning");
            textSpan.textContent = `FLAGGED SCAM (${count})`;
        } else {
            badge.classList.add("scout-high");
            textSpan.textContent = `DATABASE FLAGGED (${count})`;
        }
    } 
    else if (count >= 10 || (data && data.risk === "high")) {
        badge.classList.add("scout-high");
        textSpan.textContent = `HIGH RISK (${count})`;
    } else if (count >= 5 || (data && data.risk === "medium")) {
        badge.classList.add("scout-medium");
        textSpan.textContent = `MODERATE RISK (${count})`;
    } else if (count > 0 || (data && data.risk === "low")) {
        badge.classList.add("scout-low");
        textSpan.textContent = `SUSPICIOUS (${count})`;
    } else {
        badge.classList.add("scout-safe");
        textSpan.textContent = "SAFE";
    }

    badge.appendChild(textSpan);
    return badge;
}

async function processMainProfile() {
    if (!location.pathname.includes('/profile')) return;

    const userId = getUserIdFromUrl();
    if (!userId) return;
    
    processTerminatedFriendsBadge(userId);
    processFlaggedFriendsScanner(userId);

    const usernameEl = document.getElementById("profile-header-title-container-name");
    if (!usernameEl) return;

    if (usernameEl.dataset.scoutProcessing) return;
    usernameEl.dataset.scoutProcessing = "true";
    
    const [data, dbData] = await Promise.all([
        fetchScoutData(userId),
        fetchDatabaseData(userId)
    ]);

    if (!document.body.contains(usernameEl)) return;
    let finalBadgeNode = usernameEl; 
    if (settings.mainBadgeEnabled && data && !usernameEl.nextElementSibling?.classList.contains("scout-dynamic-badge")) {
        const badge = createMainProfileBadge(data, dbData);
        usernameEl.insertAdjacentElement("afterend", badge);
        finalBadgeNode = badge;

        if (usernameEl.parentElement) {
            usernameEl.parentElement.style.display = "flex";
            usernameEl.parentElement.style.alignItems = "center";
        }
    }
    if (dbData && dbData.isFlagged) {
        const parentContainer = usernameEl.parentElement;
        if (parentContainer && !parentContainer.querySelector(".scout-db-warning-wrapper")) {
            const warningIcon = document.createElement("span");
            warningIcon.className = "scout-db-warning-wrapper";
            if (dbData.risk === "SCAM") warningIcon.classList.add("scout-scam-warning");
            warningIcon.textContent = "!";
            warningIcon.setAttribute("data-tooltip", "This user has been flagged dangerous by the SCOUT Autonomous System. Click for details.");
            
            warningIcon.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                showScoutIntelligenceModal(userId, dbData.status, dbData.risk, dbData.created_at);
            });

            finalBadgeNode.insertAdjacentElement("afterend", warningIcon);
        }
        if (settings.autoPopupEnabled && !window.scoutAutoPopupShown) {
            window.scoutAutoPopupShown = true;
            showScoutIntelligenceModal(userId, dbData.status, dbData.risk, dbData.created_at);
        }
    }
}

// ---------------- TERMINATED FRIENDS UI ----------------
async function processTerminatedFriendsBadge(userId) {
    if (!settings.termBadgeEnabled) return;
    // No Terminated bubble (and no request) until the user clicks Scan, unless auto-scan is ON
    if (!settings.autoScanEnabled && !manualScanUsers.has(userId)) return;

    const connectionsBtn = document.querySelector(`a[href*="/users/${userId}/friends"]`);
    if (!connectionsBtn || !connectionsBtn.parentElement) return;
    if (document.getElementById("scout-term-badge")) return;

    const badge = document.createElement("div");
    badge.id = "scout-term-badge";
    badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 12px;
        padding: 0 12px;
        height: 32px; 
        font-size: 14px;
        font-weight: 600;
        border-radius: 100px; 
        background-color: rgba(231, 76, 60, 0.1);
        color: #e74c3c;
        border: 1px solid rgba(231, 76, 60, 0.3);
        white-space: nowrap;
        font-family: 'Builder Sans', 'Segoe UI', Tahoma, sans-serif;
    `;
    badge.textContent = "Scanning...";
    connectionsBtn.parentElement.appendChild(badge);

    const response = await fetchTerminatedData(userId);
    const liveBadge = document.getElementById("scout-term-badge");
    if (!liveBadge) return;

    if (!response) {
        liveBadge.remove();
        return;
    }

    if (response.terminatedCount > 0) {
        liveBadge.textContent = `${response.terminatedCount} Terminated`;
        liveBadge.style.backgroundColor = "rgba(231, 76, 60, 0.15)";
        liveBadge.style.border = "1px solid #e74c3c";
    } else {
        liveBadge.textContent = "0 Terminated";
        liveBadge.style.color = "#2ecc71";
        liveBadge.style.backgroundColor = "rgba(46, 204, 113, 0.1)";
        liveBadge.style.border = "1px solid rgba(46, 204, 113, 0.3)";
    }
}

// ---------------- FLAGGED NETWORK SCANNER ----------------
const SCOUT_SCANNER_STYLE = `
    display: inline-flex; align-items: center; gap: 8px; 
    font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 13px; font-weight: normal;
    margin-left: 12px; background: rgba(0,0,0,0.2); padding: 4px 10px; border-radius: 6px;
    vertical-align: middle; border: 1px solid transparent;
`;

async function processFlaggedFriendsScanner(userId) {
    if (!settings.termBadgeEnabled) return; // Hooked to same setting as terminated scanner
    
    const countSpans = document.querySelectorAll('.friends-count');
    if (countSpans.length === 0) return;

    const countSpan = Array.from(countSpans).find(el => el.offsetParent !== null);
    if (!countSpan) return;

    const headerEl = countSpan.parentElement;
    if (!headerEl || headerEl.dataset.scoutNetworkScanner) return;
    headerEl.dataset.scoutNetworkScanner = "true";

    const scannerUI = document.createElement("div");
    scannerUI.className = "scout-network-scanner";
    scannerUI.style.cssText = SCOUT_SCANNER_STYLE;
    headerEl.appendChild(scannerUI);

    // Auto-scan ON: original behaviour, runs immediately
    if (settings.autoScanEnabled) {
        runFlaggedFriendsScan(userId, scannerUI);
        return;
    }

    // Header was re-rendered by Roblox after a finished manual scan: restore the result, no new requests
    if (flaggedScanResults.has(userId)) {
        renderFlaggedScanResult(scannerUI, flaggedScanResults.get(userId));
        return;
    }

    // Scan already clicked and still in flight (header re-rendered mid-scan): resume the shell without refetching
    if (manualScanUsers.has(userId)) {
        scannerUI.dataset.scoutState = "running";
        scannerUI.innerHTML = scoutProgressMarkup("Scanning...");
        return;
    }

    // Default: a small Scan button, zero friends API traffic until clicked
    scannerUI.dataset.scoutState = "idle";
    scannerUI.style.cssText = "";
    scannerUI.classList.add("scout-scan-idle");
    scannerUI.innerHTML = `
        <button type="button" class="scout-scan-btn" title="Scan this user's friends against the S.C.O.U.T. database">
            <img src="${chrome.runtime.getURL("scout_logo.png")}" alt="">
            <span>Scan</span>
        </button>
    `;
    scannerUI.querySelector(".scout-scan-btn").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (scannerUI.dataset.scoutState !== "idle") return;
        manualScanUsers.add(userId);
        scannerUI.classList.remove("scout-scan-idle");
        scannerUI.style.cssText = SCOUT_SCANNER_STYLE;
        processTerminatedFriendsBadge(userId); // shows the Terminated bubble now that a scan was requested
        runFlaggedFriendsScan(userId, scannerUI);
    });
}

function scoutProgressMarkup(initialText) {
    return `
        <img src="${chrome.runtime.getURL("scout_logo.png")}" style="width: 14px; height: 14px;">
        <div style="width: 80px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
            <div class="scout-ff-progress" style="width: 0%; height: 100%; background: #e74c3c; transition: 0.3s;"></div>
        </div>
        <span class="scout-ff-text" style="color: #a0a0b0; font-size: 11px;">${initialText}</span>
    `;
}

function renderFlaggedScanResult(scannerUI, result) {
    scannerUI.dataset.scoutState = "done";
    scannerUI.style.cssText = SCOUT_SCANNER_STYLE;
    const flagged = result.flagged;
    const color = flagged > 0 ? "#e74c3c" : "#2ecc71";
    scannerUI.style.border = `1px solid ${color}`;
    scannerUI.style.background = flagged > 0 ? "rgba(231, 76, 60, 0.1)" : "rgba(46, 204, 113, 0.1)";
    scannerUI.innerHTML = `
        <img src="${chrome.runtime.getURL("scout_logo.png")}" style="width: 14px; height: 14px;">
        <span style="color: #a0a0b0; font-size: 11px;">${flagged > 0
            ? `Network Scan: <b style="color:#e74c3c">${flagged} Flagged</b>`
            : `Network Scan: <b style="color:#2ecc71">Safe</b>`}</span>
    `;
}

async function runFlaggedFriendsScan(userId, scannerUI) {
    scannerUI.dataset.scoutState = "running";
    scannerUI.innerHTML = scoutProgressMarkup("Fetching Network...");
    const textEl = scannerUI.querySelector(".scout-ff-text");
    const progressEl = scannerUI.querySelector(".scout-ff-progress");
    
    const response = await fetchFriendsList(userId);
    
    if (!response || !response.friends) {
        if (textEl) textEl.textContent = "Scan Failed";
        scannerUI.dataset.scoutState = "failed";
        return;
    }

    const friends = response.friends;
    const total = friends.length;
    if (total === 0) {
        if (textEl) textEl.textContent = "0 Friends";
        if (progressEl) progressEl.style.width = "100%";
        scannerUI.dataset.scoutState = "done";
        return;
    }

    let scanned = 0;
    let flagged = 0;
    
    // Process in chunks of 10 to simulate smooth progress and prevent browser lockup
    const chunkSize = 10; 
    for (let i = 0; i < total; i += chunkSize) {
        const chunk = friends.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (f) => {
            const dbData = await fetchFallbackData(f.id); // Strict Fallback Node route!
            if (dbData && dbData.isFlagged) flagged++;
            scanned++;
        }));
        
        if (textEl) {
            textEl.innerHTML = `<b style="color: white;">${scanned}</b>/${total} (<b style="color:#e74c3c">${flagged}</b> Flagged)`;
        }
        if (progressEl) {
            progressEl.style.width = `${(scanned / total) * 100}%`;
        }
    }

    flaggedScanResults.set(userId, { flagged, total });
    // If Roblox re-rendered the header mid-scan, update whichever shell is live now
    const liveUI = scannerUI.isConnected
        ? scannerUI
        : document.querySelector('.scout-network-scanner[data-scout-state="running"]');
    if (liveUI) renderFlaggedScanResult(liveUI, { flagged, total });
}

// ---------------- GROUP INTELLIGENCE MODAL ----------------
async function showScoutGroupIntelligenceModal(groupId) {
    if (document.getElementById('scout-group-intel-modal')) return;

    const overlay = document.createElement("div");
    overlay.id = "scout-group-intel-modal";
    overlay.className = "scout-modal-overlay";

    overlay.innerHTML = `
        <div class="scout-modal-box" onclick="event.stopPropagation()">
            <div class="scout-modal-header">
                <img src="${chrome.runtime.getURL('scout_logo.png')}" style="width: 24px; height: 24px;">
                <h3 class="scout-modal-title">Group Threat Intelligence</h3>
            </div>
            <div class="scout-modal-section">
                <div class="scout-modal-label">Target Group</div>
                <div class="scout-modal-value" id="scout-modal-target-groupname">Loading Group...</div>
            </div>
            <div class="scout-modal-section">
                <div class="scout-modal-label">Detection Vector</div>
                <div class="scout-modal-value" style="color: #e74c3c;">MANUAL VERIFICATION</div>
                <div class="scout-modal-desc">
                    This group was manually verified to contain multiple flagged accounts (invasive NSFW accounts/groups purely made to attract such accounts) OR be linked with activities in NSFW networks/communities. <br><br><b>Exercise extreme caution around this group.</b>
                </div>
            </div>
            <button class="scout-modal-close" id="scout-modal-group-close-btn">Acknowledge</button>
        </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("scout-visible"));

    try {
        const gRes = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`);
        if (gRes.ok) {
            const gData = await gRes.json();
            const nameEl = document.getElementById("scout-modal-target-groupname");
            if (nameEl) nameEl.textContent = gData.name;
        }
    } catch(e) {
        const nameEl = document.getElementById("scout-modal-target-groupname");
        if (nameEl) nameEl.textContent = "Unknown Group";
    }

    const closeModal = () => {
        overlay.classList.remove("scout-visible");
        setTimeout(() => overlay.remove(), 200);
    };

    document.getElementById("scout-modal-group-close-btn").addEventListener("click", closeModal);
    overlay.addEventListener("click", closeModal);
}

// ---------------- PROFILE GROUPS UI ----------------
async function processProfileGroups() {
    if (!settings.groupBadgeEnabled) return;
    
    const groupTiles = document.querySelectorAll('a[href*="/communities/"] .thumbnail-2d-container, a[href*="/groups/"] .thumbnail-2d-container');
    
    groupTiles.forEach(async (container) => {
        const link = container.closest('a');
        if (!link || link.dataset.scoutProcessing) return;
        link.dataset.scoutProcessing = "true";

        const match = link.href.match(/\/(communities|groups)\/(\d+)/);
        if (!match) return;
        const groupId = match[2];

        const data = await fetchGroupData(groupId);
        if (!data || !data.isFlagged) return;

        link.style.position = "relative"; 
        
        const warning = document.createElement("span");
        warning.className = "scout-db-warning-wrapper";
        warning.textContent = "!";
        warning.setAttribute("data-tooltip", "Flagged Group");
        
        warning.style.cssText = `
            position: absolute !important;
            top: 4px;
            right: 4px;
            z-index: 10;
            margin: 0 !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.6);
            cursor: pointer;
        `;
        
        warning.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showScoutGroupIntelligenceModal(groupId);
        });
        
        link.appendChild(warning);
    });
}

// ---------------- PROFILE FRIEND TILES UI ----------------
async function processFriendTiles() {
    if (!settings.listBadgeEnabled) return;

    const friendCards = document.querySelectorAll('.avatar-card-fullbody');
    
    friendCards.forEach(async (card) => {
        const link = card.querySelector('.avatar-card-link');
        if (!link || link.dataset.scoutProcessing) return;
        link.dataset.scoutProcessing = "true";

        const match = link.href.match(/\/users\/(\d+)/);
        if (!match) return;
        const targetId = match[1];

        const dbData = await fetchDatabaseData(targetId);
        if (!dbData || !dbData.isFlagged) return;
        card.style.position = "relative"; 
        
        const warning = document.createElement("div");
        warning.className = "scout-db-warning-wrapper scout-friend-tile-warning";
        if (dbData.risk === "SCAM") warning.classList.add("scout-scam-warning");
        warning.textContent = "!";
        
        // --- GLOBAL TOOLTIP TELEPORT LOGIC ---
        warning.addEventListener("mouseenter", (e) => {
            const tooltip = document.createElement("div");
            tooltip.className = "scout-db-tooltip";
            tooltip.textContent = "This user has been flagged by the SCOUT Autonomous System.";
            document.body.appendChild(tooltip);
            
            const rect = warning.getBoundingClientRect();
            tooltip.style.left = (rect.left + window.scrollX) + "px";
            tooltip.style.top = (rect.top + window.scrollY - 30) + "px";
            warning.dataset.tooltipElement = "true";
            warning.tooltipRef = tooltip;
        });

        warning.addEventListener("mouseleave", () => {
            if (warning.tooltipRef) warning.tooltipRef.remove();
        });

        warning.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showScoutIntelligenceModal(targetId, dbData.status, dbData.risk, dbData.created_at);
        });
        
        // Append to the avatar card container, but now it's globally managed
        card.appendChild(warning);
    });
}

// ---------------- GROUP PAGE UI ----------------
async function processGroupPage() {
    if (!settings.groupBadgeEnabled) return;
    if (!location.pathname.match(/\/(communities|groups)\//)) return;

    const groupId = getGroupIdFromUrl();
    if (!groupId) return;

    const groupNameEl = document.querySelector(".profile-header-details-community-name");
    if (!groupNameEl) return;

    if (groupNameEl.querySelector(".scout-group-badge")) return;
    if (groupNameEl.dataset.scoutProcessing) return;
    groupNameEl.dataset.scoutProcessing = "true";

    const data = await fetchGroupData(groupId);
    if (!data || !data.isFlagged) {
        delete groupNameEl.dataset.scoutProcessing;
        return;
    }
    async function fetchFriendsList(userId) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "getFriendsList", userId: userId }, (response) => {
            if (chrome.runtime.lastError || !response || response.error) {
                resolve(null);
            } else { resolve(response); }
        });
    });
}

async function fetchFallbackData(userId) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "checkFallbackBrain", userId: userId }, (response) => {
            if (chrome.runtime.lastError || !response) {
                resolve({ isFlagged: false });
            } else { resolve(response); }
        });
    });
}

    if (!document.body.contains(groupNameEl)) return;
    if (!settings.groupBadgeEnabled) return;
    if (groupNameEl.querySelector(".scout-group-badge")) return;

    // Create the Badge
    const badge = document.createElement("span");
    badge.className = "scout-badge scout-group-badge scout-high"; 
    badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 24px; 
        line-height: 24px;
        padding: 0 10px; 
        border-radius: 6px; 
        margin-left: 10px; 
        font-size: 13px;
        font-weight: 700;
        vertical-align: middle;
        box-sizing: border-box; 
    `;

    const logo = document.createElement("img");
    logo.src = chrome.runtime.getURL("scout_logo.png");
    logo.style.cssText = "width: 14px; height: 14px; margin-right: 6px; flex-shrink: 0;";
    badge.appendChild(logo);

    const textSpan = document.createElement("span");
    textSpan.textContent = "DANGEROUS GROUP";
    badge.title = "This group has been manually flagged by a SCOUT administrator due to safety concerns.";
    badge.appendChild(textSpan);

    // Create the Clickable Warning Icon
    const warningIcon = document.createElement("span");
    warningIcon.className = "scout-db-warning-wrapper";
    warningIcon.textContent = "!";
    warningIcon.setAttribute("data-tooltip", "Click for threat details.");
    warningIcon.style.cursor = "pointer";
    warningIcon.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showScoutGroupIntelligenceModal(groupId);
    });

    groupNameEl.style.display = "inline-flex";
    groupNameEl.style.alignItems = "center";
    groupNameEl.appendChild(badge);
    groupNameEl.appendChild(warningIcon);

    // Trigger Auto-Popup once per page load
    if (settings.autoGroupPopupEnabled && !window.scoutGroupAutoPopupShown) {
        window.scoutGroupAutoPopupShown = true;
        showScoutGroupIntelligenceModal(groupId);
    }
}

// ---------------- SEARCH PAGE UI ----------------
function processCommunitySearch() {
    if (!settings.groupBadgeEnabled) return;
    if (!location.pathname.includes('/search/communities') && !location.pathname.includes('/search/groups')) return;

    const groupLinks = document.querySelectorAll('a[href*="/communities/"], a[href*="/groups/"]');

    groupLinks.forEach(async (link) => {

        const match = link.getAttribute("href").match(/\/(communities|groups)\/(\d+)/);
        if (!match) return;
        const groupId = match[2];

        const nameEl = link.querySelector('.font-header-2.text-overflow');
        if (!nameEl) return;

        if (nameEl.querySelector('.scout-search-badge')) return;
        if (nameEl.dataset.scoutProcessing) return;
        nameEl.dataset.scoutProcessing = "true";

        const data = await fetchGroupData(groupId);
        if (!data) {
            delete nameEl.dataset.scoutProcessing;
            return;
        }

        if (!document.body.contains(nameEl)) return;
        if (!settings.groupBadgeEnabled) return;
        if (nameEl.querySelector('.scout-search-badge')) return;
        if (data.isFlagged) {
            const badge = document.createElement("span");
            badge.className = "scout-badge scout-search-badge scout-high"; 

            badge.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                height: 20px; 
                line-height: 20px;
                padding: 0 6px; 
                border-radius: 4px; 
                margin-left: 8px; 
                font-size: 11px;
                font-weight: 700;
                vertical-align: middle;
                box-sizing: border-box;
                color: white;
                background-color: #e74c3c;
            `;
            
            const logo = document.createElement("img");
            logo.src = chrome.runtime.getURL("scout_logo.png");
            logo.style.cssText = "width: 12px; height: 12px; margin-right: 4px; flex-shrink: 0;";
            badge.appendChild(logo);

            const textSpan = document.createElement("span");
            textSpan.textContent = "DANGEROUS";
            badge.appendChild(textSpan);

            badge.title = "This group has been manually flagged by a SCOUT administrator due to safety concerns.";
            nameEl.style.display = "inline-flex";
            nameEl.style.alignItems = "center";
            nameEl.appendChild(badge);
        }
    });
}

// ---------------- PAGINATED LISTS ----------------
function processListLinks() {
    if (!settings.listBadgeEnabled) return;
    if (!location.pathname.match(/\/(friends|followers|followings?)/)) return;
    document.querySelectorAll('.scout-db-warning-wrapper').forEach(badge => {
        if (badge.parentElement && badge.parentElement.closest('.avatar-card-content, .friend-item')) {
            const prev = badge.previousElementSibling;
            if (!prev || prev.tagName !== 'A' || !prev.getAttribute("href")?.includes("/users/")) {
                badge.remove();
            }
        }
    });

    const links = Array.from(document.querySelectorAll('.avatar-name[href*="/users/"], .friend-name[href*="/users/"]'))
        .filter(a => a.textContent.trim().length > 0);

    links.forEach(async (link) => {
        const match = link.getAttribute("href").match(/\/users\/(\d+)/);
        if (!match) return;
        const userId = match[1];

        if (userId === getUserIdFromUrl()) return;
        if (link.dataset.scoutUserId !== userId) {
            const nextEl = link.nextElementSibling;
            if (nextEl && nextEl.classList.contains("scout-db-warning-wrapper")) {
                nextEl.remove();
            }
            link.removeAttribute("data-scout-warning-processed");
            link.dataset.scoutUserId = userId;
        }
        if (!link.dataset.scoutWarningProcessed) {
            link.dataset.scoutWarningProcessed = "true";
            
            const dbData = await fetchDatabaseData(userId);
            if (document.body.contains(link) && link.dataset.scoutUserId === userId) {
                if (dbData && dbData.isFlagged && settings.listBadgeEnabled) {
                    if (!link.nextElementSibling || !link.nextElementSibling.classList.contains("scout-db-warning-wrapper")) {
                        const warningIcon = document.createElement("span");
                        warningIcon.className = "scout-db-warning-wrapper";
                        if (dbData.risk === "SCAM") warningIcon.classList.add("scout-scam-warning");
                        warningIcon.textContent = "!";
                        warningIcon.setAttribute("data-tooltip", "This user has been flagged dangerous by the SCOUT Autonomous System. Click for details.");
                        
                        warningIcon.style.transform = "scale(0.85)"; 
                        warningIcon.style.marginLeft = "6px";
                        
                        warningIcon.addEventListener("click", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            showScoutIntelligenceModal(userId, dbData.status, dbData.risk, dbData.created_at);
                        });

                        link.insertAdjacentElement("afterend", warningIcon);
                    }
                }
            }
        }
        if (processedListUsers.has(userId)) return;
        processedListUsers.add(userId); 

        const data = await fetchScoutData(userId);
        if (!data) {
            processedListUsers.delete(userId); 
            return;
        }
        if (!settings.listBadgeEnabled) return;

        const count = data.flaggedGroupCount || 0;
        let bgColor = "#2ecc71"; 
        let textColor = "white";
        
        if (count >= 10 || data.risk === "high") { bgColor = "#e74c3c"; }
        else if (count >= 5 || data.risk === "medium") { bgColor = "#e67e22"; }
        else if (count > 0 || data.risk === "low") { bgColor = "#f1c40f"; textColor = "black"; }

        const cssRule = `
            #content a.avatar-name[href*="/users/${userId}/"]::after, 
            #content a.friend-name[href*="/users/${userId}/"]::after {
                content: "${count}";
                display: inline-block;
                padding: 2px 6px 2px 20px;
                border-radius: 6px;
                margin-left: 6px;
                vertical-align: middle;
                font-size: 12px;
                font-weight: 600;
                color: ${textColor};
                background-color: ${bgColor};
                background-image: var(--scout-logo-url);
                background-size: 12px 12px;
                background-repeat: no-repeat;
                background-position: 4px center;
                line-height: normal;
            }
        `;
        
        dynamicStyleTag.appendChild(document.createTextNode(cssRule));
    });
}

// ---------------- MASTER OBSERVER & FALLBACKS ----------------
let debounceTimer;

const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        processMainProfile();
        processGroupPage(); 
        processCommunitySearch();
        processListLinks();
        processProfileGroups();
        processFriendTiles();
    }, 500); 
});
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener("hashchange", () => {
    setTimeout(() => {
        processMainProfile();
        processGroupPage(); 
        processCommunitySearch();
        processListLinks();
        processProfileGroups();
        processFriendTiles();
    }, 100); 
});

setInterval(() => {
    processMainProfile();
    processGroupPage(); 
    processCommunitySearch();
    processListLinks();
    processProfileGroups();
    processFriendTiles();
}, 2000); 

setTimeout(() => {
    processMainProfile();
    processGroupPage(); 
    processCommunitySearch();
    processListLinks();
    processProfileGroups();
    processFriendTiles();
}, 500);

// ---------------- CLIPBOARD LISTENER ----------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "copyToClipboard") {
        const textArea = document.createElement("textarea");
        textArea.value = request.text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            console.log(`SCOUT: Copied ${request.text} to clipboard!`);
        } catch (err) {
            console.error('SCOUT: Failed to copy ID', err);
        }
        document.body.removeChild(textArea);
        sendResponse({ success: true });
    }
});