import { StorageManager } from './js/storage.js';
import { updateChromeRules, removeChromeRule, setGlobalBlock } from './js/blocking.js';
import { isTimeNowInRange } from './js/utils.js';

let isChecking = false;
let keepAliveInterval = null;

function manageKeepAlive(shouldBeActive) {
    if (shouldBeActive && !keepAliveInterval) {
        keepAliveInterval = setInterval(() => {
            chrome.runtime.getPlatformInfo(() => {}); 
            console.log("Keep-alive active");
        }, 20000);
    } else if (!shouldBeActive && keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

async function checkAllRules() {
    if (isChecking) return;
    isChecking = true;

    try {
        const now = Date.now();
        const sites = await StorageManager.getSites();
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const siteMap = new Map();
        sites.forEach(s => siteMap.set(Math.floor(Number(s.id)), s));

        let nextCheckTime = null;
        let nearExpiry = false;

        for (const rule of existingRules) {
            if (rule.id === 9999) continue;
            const site = siteMap.get(rule.id);
            
            let shouldBeDeleted = false;
            if (!site || site.paused) {
                shouldBeDeleted = true;
            } else if (site.type === 'dauer' && site.expiry) {
                if (now >= site.expiry) {
                    shouldBeDeleted = true;
                } else {
                    if (!nextCheckTime || site.expiry < nextCheckTime) nextCheckTime = site.expiry;
                    if (site.expiry - now < 60000) nearExpiry = true; // Timer < 1 Min?
                }
            } else if (site.type === 'bereich' && !isTimeNowInRange(site.start, site.end)) {
                shouldBeDeleted = true;
            }

            if (shouldBeDeleted) await removeChromeRule(rule.id, site?.url);
        }

        for (const site of sites) {
            const sId = Math.floor(Number(site.id));
            if (isNaN(sId) || sId === 9999 || site.paused) continue;
            
            let shouldBlock = false;
            if (site.type === 'bereich') shouldBlock = isTimeNowInRange(site.start, site.end);
            else if (site.type === 'dauer') {
                shouldBlock = !!(site.expiry && site.expiry > now);
                if (shouldBlock && site.expiry - now < 60000) nearExpiry = true;
            }

            const isAlreadyActive = existingRules.some(r => r.id === sId);
            if (shouldBlock && !isAlreadyActive) await updateChromeRules(sId, site.url);
        }

        manageKeepAlive(nearExpiry);

        if (nextCheckTime) {
            chrome.alarms.create('checkTimeRules', { when: Math.max(now + 1000, nextCheckTime) });
        }

    } catch (error) {
        console.error("Check Error:", error);
    } finally {
        isChecking = false;
    }
}

chrome.webNavigation.onBeforeNavigate.addListener((d) => { if (d.frameId === 0) checkAllRules(); });
chrome.runtime.onMessage.addListener((msg, s, res) => {
    if (msg.action === "checkRulesNow") {
        checkAllRules().then(() => res?.({status: "done"}));
        return true; 
    }
});

chrome.alarms.onAlarm.addListener(checkAllRules);
chrome.tabs.onActivated.addListener(checkAllRules);
chrome.windows.onFocusChanged.addListener(checkAllRules);
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('checkTimeRules', { periodInMinutes: 1 });
    checkAllRules();
});

checkAllRules();