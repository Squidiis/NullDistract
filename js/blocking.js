export async function updateChromeRules(id, url) {
    const numericId = Math.floor(parseInt(id));
    if (isNaN(numericId) || numericId === 9999) return;

    let domain = url.trim().toLowerCase()
        .replace(/^(?:https?:\/\/)?(?:www\.)?/i, "")
        .split('/')[0];

    if (!domain) return;

    try {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [numericId], 
            addRules: [{
                "id": numericId,
                "priority": 3000,
                "action": { "type": "block" },
                "condition": { 
                    "urlFilter": `||${domain}*`, 
                    "resourceTypes": ["main_frame", "sub_frame", "stylesheet", "script", "image", "xmlhttprequest", "media", "other", "websocket"] 
                }
            }]
        });

        if (chrome.browsingData) {
            chrome.browsingData.remove({
                "origins": [`https://${domain}`, `http://${domain}`]
            }, { "serviceWorkers": true, "cacheStorage": true }).catch(() => {});
        }

        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.url && tab.url.toLowerCase().includes(domain)) {
                chrome.tabs.reload(tab.id, { bypassCache: true }).catch(() => {});
            }
        }
    } catch (e) { 
        console.error("Fehler beim Update der Regel:", e); 
    }
}

export async function removeChromeRule(id, url = null) {
    const numericId = Math.floor(parseInt(id));
    if (isNaN(numericId)) return;

    try {
        await chrome.declarativeNetRequest.updateDynamicRules({ 
            removeRuleIds: [numericId] 
        });

        if (!url) {
            const result = await chrome.storage.local.get(['blockedSites']);
            const sites = result.blockedSites || [];
            const site = sites.find(s => Math.floor(Number(s.id)) === numericId);
            url = site?.url;
        }

        if (url) {
            const domain = url.trim().toLowerCase()
                .replace(/^(?:https?:\/\/)?(?:www\.)?/i, "")
                .split('/')[0];
            
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.url && tab.url.toLowerCase().includes(domain)) {
                    chrome.tabs.reload(tab.id).catch(() => {});
                }
            }
        }
    } catch (e) {
        console.error("Fehler beim Entfernen der Regel:", e);
    }
}

export async function setGlobalBlock(active) {
    const GLOBAL_ID = 9999;
    
    if (active) {
        try {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [GLOBAL_ID],
                addRules: [{
                    "id": GLOBAL_ID,
                    "priority": 2000, 
                    "action": { "type": "block" },
                    "condition": { 
                        "urlFilter": "*", 
                        "resourceTypes": ["main_frame"], 
                        "excludedDomains": [
                            "google.com", "google.de", "bing.com", 
                            "duckduckgo.com", "yahoo.com"
                        ]
                    }
                }]
            });

            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab && activeTab.url) {
                const isSearch = ["google", "bing", "duckduckgo"].some(s => activeTab.url.includes(s));
                if (!isSearch && activeTab.url.startsWith('http')) {
                    chrome.tabs.reload(activeTab.id).catch(() => {});
                }
            }
        } catch (e) {
            console.error("Fehler beim Setzen des Global Blocks:", e);
        }
    } else {
        await chrome.declarativeNetRequest.updateDynamicRules({ 
            removeRuleIds: [GLOBAL_ID] 
        });
    }
}