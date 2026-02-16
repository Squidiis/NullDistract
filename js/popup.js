import { formatMinutes, cleanUrl } from './utils.js';
import { StorageManager } from './storage.js';
import { removeChromeRule, setGlobalBlock } from './blocking.js';

let editModeId = null;

const urlInput = document.getElementById('urlInput');
const hoursInput = document.getElementById('inputHours');
const minutesInput = document.getElementById('inputMinutes');
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
const addBtn = document.getElementById('addBlockBtn');
const cancelBtn = document.getElementById('cancelEditBtn');
const globalSwitch = document.getElementById('globalSwitch');
const themeToggle = document.getElementById('themeToggle');

async function init() {
    try {
        const theme = await StorageManager.getTheme();
        if (theme === 'dark') {
            document.body.classList.add('dark');
            if (themeToggle) themeToggle.classList.replace('icon-sun', 'icon-moon');
        }

        const isGlobalActive = await StorageManager.getGlobalStatus();
        if (globalSwitch) {
            if (isGlobalActive) globalSwitch.classList.add('active');
            globalSwitch.onclick = async () => {
                const isActive = globalSwitch.classList.toggle('active');
                await StorageManager.setGlobalStatus(isActive);
                await setGlobalBlock(isActive);
                chrome.runtime.sendMessage({ action: "checkRulesNow" });
            };
        }

        if (themeToggle) {
            themeToggle.onclick = async () => {
                const isDarkNow = document.body.classList.toggle('dark');
                await StorageManager.setTheme(isDarkNow ? 'dark' : 'light');
                themeToggle.classList.toggle('icon-sun', !isDarkNow);
                themeToggle.classList.toggle('icon-moon', isDarkNow);
            };
        }

        document.querySelector('header .icon-close')?.addEventListener('click', () => window.close());

        await renderList();
        setupFormEvents();

        setInterval(() => renderList(true), 1000);

        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === "uiUpdateRequired") {
                window._cachedSites = null; 
                renderList(); 
            }
        });
    } catch (err) { 
        console.error("Initialization error:", err); 
    }
}

async function renderList(isTick = false) {
    const listElement = document.getElementById('blockList');
    if (!listElement) return;

    if (!isTick || !window._cachedSites) {
        window._cachedSites = await StorageManager.getSites();
    }
    
    const sites = window._cachedSites;
    listElement.innerHTML = ''; 

    sites.forEach(site => {
        const numericId = parseInt(site.id);
        const now = Date.now();
        
        let isExpired = false;
        let timeDisplay = "";

        if (site.type === 'bereich') {
            timeDisplay = `${site.start} - ${site.end}`;
        } else {
            if (!site.dauer || site.dauer === 0) {
                timeDisplay = "Permanently Blocked";
            } else {
                const limitStr = formatMinutes(site.dauer);
                const remainingMs = (site.expiry || 0) - now;
                
                if (site.paused) {
                    timeDisplay = `Limit: ${limitStr} (Inactive)`;
                } else if (remainingMs <= 0) {
                    timeDisplay = `Limit: ${limitStr} | Expired`;
                    isExpired = true;
                } else {
                    const totalSecs = Math.floor(remainingMs / 1000);
                    const m = Math.floor(totalSecs / 60);
                    const s = totalSecs % 60;
                    timeDisplay = `Limit: ${limitStr} | ${m}:${s.toString().padStart(2, '0')} left`;
                }
            }
        }

        const isButtonActive = !site.paused && !isExpired;

        const card = document.createElement('div');
        card.className = `blocked-card ${(site.paused || isExpired) ? 'disabled' : ''}`;

        card.innerHTML = `
            <div class="card-left">
                <button class="switch-btn ${isButtonActive ? 'active' : ''}" aria-label="Toggle"></button>
                <div class="blocked-info">
                    <span class="url">${site.url}</span>
                    <span class="time-left"><span class="icon icon-clock"></span> ${timeDisplay}</span>
                </div>
            </div>
            <div class="actions">
                <button class="action-btn btn-edit-item" title="Edit"><span class="icon icon-edit"></span></button>
                <button class="action-btn btn-delete-item" title="Delete"><span class="icon icon-close"></span></button>
            </div>
        `;

        card.querySelector('.switch-btn').onclick = async (e) => {
            if (e.target.disabled) return;
            e.target.disabled = true;

            const allSites = await StorageManager.getSites();
            const idx = allSites.findIndex(s => s.id == site.id);
            
            if (idx !== -1) {
                const item = allSites[idx];
                const now = Date.now();
                const isExpiredNow = item.type === 'dauer' && item.dauer > 0 && (item.expiry || 0) <= now;

                if (item.paused || isExpiredNow) {
                    item.paused = false;
                    if (item.type === 'dauer' && item.dauer > 0) {
                        item.expiry = Date.now() + (item.dauer * 60 * 1000);
                    }
                } else {
                    item.paused = true;
                }

                await StorageManager.saveSites(allSites);
                
                window._cachedSites = null; 
                
                chrome.runtime.sendMessage({ action: "checkRulesNow" }, async () => {
                    await renderList();
                    e.target.disabled = false;
                });
            }
        };

        card.querySelector('.btn-delete-item').onclick = async () => {
            await removeChromeRule(numericId);
            await StorageManager.deleteSite(numericId);
            window._cachedSites = null;
            chrome.runtime.sendMessage({ action: "checkRulesNow" });
            renderList();
        };

        card.querySelector('.btn-edit-item').onclick = () => enterEditMode(site);
        listElement.appendChild(card);
    });
}

async function handleSave() {
    const url = cleanUrl(urlInput.value);
    if (!url) { urlInput.focus(); return; }

    const isDauerView = document.getElementById('btnDauer').classList.contains('active');
    const h = parseInt(hoursInput.value || 0);
    const m = parseInt(minutesInput.value || 0);
    const totalMinutes = (h * 60) + m;

    const data = {
        id: editModeId || Date.now(),
        url,
        type: isDauerView ? 'dauer' : 'bereich',
        paused: false,
        dauer: (isDauerView && totalMinutes > 0) ? totalMinutes : 0, 
        expiry: (isDauerView && totalMinutes > 0) ? (Date.now() + totalMinutes * 60 * 1000) : null,
        start: startTimeInput.value,
        end: endTimeInput.value
    };

    await StorageManager.saveSite(data, editModeId);
    window._cachedSites = null; 
    chrome.runtime.sendMessage({ action: "checkRulesNow" });
    exitEditMode();
    renderList();
}

function setupFormEvents() {
    const btnDauer = document.getElementById('btnDauer');
    const btnZeitbereich = document.getElementById('btnZeitbereich');

    if (addBtn) addBtn.onclick = handleSave;
    if (cancelBtn) cancelBtn.onclick = exitEditMode;

    btnDauer?.addEventListener('click', () => {
        btnDauer.classList.add('active');
        btnZeitbereich.classList.remove('active');
        document.getElementById('viewDauer').style.display = 'block';
        document.getElementById('viewZeitbereich').style.display = 'none';
    });
    btnZeitbereich?.addEventListener('click', () => {
        btnZeitbereich.classList.add('active');
        btnDauer.classList.remove('active');
        document.getElementById('viewZeitbereich').style.display = 'block';
        document.getElementById('viewDauer').style.display = 'none';
    });
}

function enterEditMode(site) {
    editModeId = site.id;
    urlInput.value = site.url;
    if (site.type === 'dauer') {
        document.getElementById('btnDauer').click();
        hoursInput.value = site.dauer > 0 ? Math.floor(site.dauer / 60) : '';
        minutesInput.value = site.dauer > 0 ? (site.dauer % 60) : '';
    } else {
        document.getElementById('btnZeitbereich').click();
        startTimeInput.value = site.start;
        endTimeInput.value = site.end;
    }
    addBtn.innerText = "Update Rule";
    cancelBtn.style.display = "block";
    urlInput.focus();
}

function exitEditMode() {
    editModeId = null;
    urlInput.value = '';
    hoursInput.value = '';
    minutesInput.value = '';
    startTimeInput.value = '';
    endTimeInput.value = '';
    addBtn.innerText = "Block Website";
    cancelBtn.style.display = "none";
}

document.addEventListener('DOMContentLoaded', init);