import { StorageManager } from './js/storage.js';
import { updateChromeRules, removeChromeRule, setGlobalBlock } from './js/blocking.js';
import { isTimeNowInRange } from './js/utils.js';

let isChecking = false;

async function checkAllRules() {
    if (isChecking) return; 
    isChecking = true;

    try {
        const isGlobalActive = await StorageManager.getGlobalStatus();
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const existingIds = new Set(existingRules.map(r => r.id));
        
        if (isGlobalActive) {
            if (!existingIds.has(9999)) await setGlobalBlock(true);
            isChecking = false; 
            return; 
        } else if (existingIds.has(9999)) {
            await setGlobalBlock(false);
        }

        const sites = await StorageManager.getSites();
        let hasChanges = false;
        const now = Date.now();

        for (const site of sites) {
            const sId = Math.floor(parseInt(site.id));
            if (isNaN(sId) || sId === 9999) continue;

            let shouldBeBlocked = false;

            if (!site.paused) {
                if (site.type === 'bereich') {
                    shouldBeBlocked = isTimeNowInRange(site.start, site.end);
                } 
                else if (site.type === 'dauer') {
                    if (site.dauer > 0) {
                        
                        if (!site.expiry) {
                            shouldBeBlocked = false; 
                        } else {
                            const remaining = site.expiry - now;
                            if (remaining > 0) {
                                shouldBeBlocked = true;
                            } else {
                                shouldBeBlocked = false;
                                if (!site.paused) {
                                    site.paused = true;
                                    hasChanges = true;
                                }
                            }
                        }
                    } else {
                        shouldBeBlocked = true; 
                    }
                }
            }

            const isCurrentlyBlocked = existingIds.has(sId);

            if (shouldBeBlocked && !isCurrentlyBlocked) {
                await updateChromeRules(sId, site.url);
            } else if (!shouldBeBlocked && isCurrentlyBlocked) {
                await removeChromeRule(sId);
            }
        }

        if (hasChanges) {
            await StorageManager.saveSites(sites);
            chrome.runtime.sendMessage({ action: "uiUpdateRequired" }).catch(() => {});
        }
    } catch (error) {
        console.error("Kritischer Fehler im Background-Check:", error);
    } finally {
        setTimeout(() => { isChecking = false; }, 100);
    }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkTimeRules') checkAllRules();
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('checkTimeRules', { periodInMinutes: 1 });
    checkAllRules();
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "checkRulesNow") {
        checkAllRules();
    }
});

checkAllRules();