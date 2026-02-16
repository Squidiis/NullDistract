export async function updateChromeRules(id, url) {
    const numericId = Math.floor(parseInt(id));
    let domain = url.trim().toLowerCase()
        .replace(/^(?:https?:\/\/)?(?:www\.)?/i, "")
        .split('/')[0];

    if (!domain || isNaN(numericId)) return;

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
        console.error("Fehler Blocking:", e); 
    }
}

export async function removeChromeRule(id, url = null) {
    const numericId = Math.floor(parseInt(id));
    if (isNaN(numericId)) return;

    try {
        const removePromise = chrome.declarativeNetRequest.updateDynamicRules({ 
            removeRuleIds: [numericId] 
        });

        if (!url) {
            const result = await chrome.storage.local.get(['blockedSites']);
            const sites = result.blockedSites || [];
            const site = sites.find(s => Math.floor(Number(s.id)) === numericId);
            url = site?.url;
        }

        await removePromise;

        if (url) {
            const domain = url.trim().toLowerCase()
                .replace(/^(?:https?:\/\/)?(?:www\.)?/i, "")
                .split('/')[0];
            
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                if (tab.url && tab.url.toLowerCase().includes(domain)) {
                   
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => { window.location.href = window.location.href; }
                    }).catch(() => {
                        chrome.tabs.reload(tab.id, { bypassCache: true });
                    });
                }
            }

            if (chrome.browsingData) {
                chrome.browsingData.remove({
                    "origins": [`https://${domain}`, `http://${domain}`]
                }, { "serviceWorkers": true, "cacheStorage": true }).catch(() => {});
            }
        }
    } catch (e) {
        console.error("Fehler beim Entfernen:", e);
    }
}


export async function setGlobalBlock(active) {
    const GLOBAL_ID = 9999;
    
    if (active) {
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
        await chrome.declarativeNetRequest.updateDynamicRules({ 
            removeRuleIds: [GLOBAL_ID] 
        });
    }
}