import { StorageManager } from './js/storage.js';
import { updateChromeRules, removeChromeRule, setGlobalBlock } from './js/blocking.js';
import { isTimeNowInRange } from './js/utils.js';

let isChecking = false;

async function checkAllRules(isAlarmSource = false) {
    if (isChecking) return;
    isChecking = true;

    try {
        const isGlobalActive = await StorageManager.getGlobalStatus();
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const existingIds = new Set(existingRules.map(r => r.id));
        
        if (isGlobalActive) {
            if (!existingIds.has(9999)) {
                await setGlobalBlock(true);
            }

            const sites = await StorageManager.getSites();
            for (const site of sites) {
                const sId = Math.floor(parseInt(site.id));
                if (existingIds.has(sId)) {
                    await removeChromeRule(sId);
                }
            }
            
            isChecking = false;
            return; 
        } else {
            if (existingIds.has(9999)) {
                await setGlobalBlock(false);
            }
        }

        const sites = await StorageManager.getSites();
        let hasChanges = false;

        for (const site of sites) {
            const sId = Math.floor(parseInt(site.id));
            if (isNaN(sId) || sId === 9999) continue;

            let shouldBeBlocked = false;

            if (!site.paused) {
                if (site.type === 'bereich') {
                    shouldBeBlocked = isTimeNowInRange(site.start, site.end);
                } 
                else if (site.type === 'dauer') {

                    if (site.dauer > 0 && (site.remainingMinutes === undefined || site.remainingMinutes === null)) {
                        site.remainingMinutes = site.dauer;
                        hasChanges = true;
                    }

                    if (site.remainingMinutes > 0) {
                        shouldBeBlocked = true;
                        if (isAlarmSource) {
                            site.remainingMinutes -= 1;
                            hasChanges = true;
                        }
                    } else if (site.dauer > 0) {

                        shouldBeBlocked = false;
                        site.paused = true; 
                        hasChanges = true;
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
        console.error("Fehler im Background-Check:", error);
    } finally {
        isChecking = false;
    }
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('checkTimeRules', { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener(() => checkAllRules(true));
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "checkRulesNow") checkAllRules(false);
});

checkAllRules(false);