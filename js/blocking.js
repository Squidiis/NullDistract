export async function updateChromeRules(id, url) {
    const numericId = Math.floor(parseInt(id));
    let domain = url.trim().toLowerCase()
        .replace(/^(?:https?:\/\/)?(?:www\.)?/i, "")
        .split('/')[0];

    if (!domain || isNaN(numericId)) return;

    try {

        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        if (existingRules.some(r => r.id === numericId)) return;

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
            try {
                await chrome.browsingData.remove({
                    "origins": [`https://${domain}`, `https://www.${domain}`]
                }, { "serviceWorkers": true, "cacheStorage": true });
            } catch (e) {}
        }

        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.url && tab.url.toLowerCase().includes(domain)) {
                chrome.tabs.reload(tab.id, { bypassCache: true }).catch(() => {});
            }
        }
    } catch (e) { console.error("Fehler Blocking:", e); }
}

export async function removeChromeRule(id, url = null) {
    const numericId = Math.floor(parseInt(id));
    if (isNaN(numericId)) return;
    try {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [numericId] });
    } catch (e) { console.error("Fehler beim Entfernen:", e); }
}

export async function setGlobalBlock(active) {
    const GLOBAL_ID = 9999;
    
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const isAlreadyActive = existingRules.some(r => r.id === GLOBAL_ID);

    if (active) {
        if (isAlreadyActive) return; 

        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [GLOBAL_ID],
            addRules: [{
                "id": GLOBAL_ID,
                "priority": 3000,
                "action": { "type": "block" },
                "condition": { 
                    "urlFilter": "*", 
                    "resourceTypes": ["main_frame", "sub_frame"], 
                    "excludedDomains": ["google.com", "google.de", "bing.com", "duckduckgo.com"]
                }
            }]
        });

        const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }); 
        for (const tab of tabs) {
            const isSearch = ["google", "bing", "duckduckgo"].some(s => tab.url.includes(s));
            if (!isSearch) {
                chrome.tabs.reload(tab.id, { bypassCache: true }).catch(() => {});
            }
        }
    } else {
        if (!isAlreadyActive) return; 
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [GLOBAL_ID] });
    }
}