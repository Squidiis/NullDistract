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
        const now = Date.now();
        
        const idsThatShouldBeActive = new Set();

        for (const site of sites) {
            const sId = Math.floor(Number(site.id));
            if (isNaN(sId) || sId === 9999) continue;

            let shouldBeBlocked = false;

            if (!site.paused) {
                if (site.type === 'bereich') {
                    shouldBeBlocked = isTimeNowInRange(site.start, site.end);
                } 
                else if (site.type === 'dauer') {
                    if (site.dauer > 0) {
                        shouldBeBlocked = !!(site.expiry && site.expiry > now);
                    } else {
                        shouldBeBlocked = true; 
                    }
                }
            }

            if (shouldBeBlocked) {
                idsThatShouldBeActive.add(sId);
                if (!existingIds.has(sId)) {
                    await updateChromeRules(sId, site.url);
                }
            }
        }
        
        for (const ruleId of existingIds) {
            if (ruleId === 9999) continue; 

            if (!idsThatShouldBeActive.has(ruleId)) {
                console.warn(`Lösche hängende Regel ID: ${ruleId}`);
                await removeChromeRule(ruleId); 
            }
        }

    } catch (error) {
        console.error("Fehler im Background-Check:", error);
    } finally {
        isChecking = false;
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "checkRulesNow") {
        checkAllRules().then(() => {
            if (sendResponse) sendResponse({status: "sync_complete"});
        });
        return true; 
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkTimeRules') checkAllRules();
});


chrome.tabs.onActivated.addListener(() => checkAllRules());
chrome.windows.onFocusChanged.addListener(() => checkAllRules());

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('checkTimeRules', { periodInMinutes: 1 });
    checkAllRules();
});

checkAllRules();