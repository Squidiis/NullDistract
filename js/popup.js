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

        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === "uiUpdateRequired") {
                renderList(); 
            }
        });
    } catch (err) { 
        console.error("Fehler bei Init:", err); 
    }
}


async function renderList() {
    const listElement = document.getElementById('blockList');
    if (!listElement) return;

    const sites = await StorageManager.getSites();
    listElement.innerHTML = ''; 

    sites.forEach(site => {
        const numericId = parseInt(site.id);
        const card = document.createElement('div');
        card.setAttribute('data-id', numericId);
        
        const isExpired = site.type === 'dauer' && 
                         site.dauer > 0 && 
                         (site.remainingMinutes <= 0) && 
                         !site.paused; 

        card.className = `blocked-card ${ (site.paused || isExpired) ? 'disabled' : ''}`;
        
        let timeDisplay = "";
        if (site.type === 'bereich') {
            timeDisplay = `${site.start} - ${site.end}`;
        } else {
            if (!site.dauer || site.dauer === 0) {
                timeDisplay = "Dauerhaft gesperrt";
            } else {
                const limitStr = formatMinutes(site.dauer);
                const remaining = site.remainingMinutes ?? site.dauer;
                
                if (site.paused) {
                    timeDisplay = `Limit: ${limitStr} (Inaktiv)`;
                } else if (remaining <= 0) {
                    timeDisplay = `Limit: ${limitStr} | Abgelaufen`;
                } else {
                    timeDisplay = `Limit: ${limitStr} | ${formatMinutes(remaining)} übrig`;
                }
            }
        }

        card.innerHTML = `
            <div class="card-left">
                <button class="switch-btn ${site.paused ? '' : 'active'}" aria-label="Aktivieren/Deaktivieren"></button>
                <div class="blocked-info">
                    <span class="url">${site.url}</span>
                    <span class="time-left"><span class="icon icon-clock"></span> ${timeDisplay}</span>
                </div>
            </div>
            <div class="actions">
                <button class="action-btn btn-edit-item"><span class="icon icon-edit"></span></button>
                <button class="action-btn btn-delete-item"><span class="icon icon-close"></span></button>
            </div>
        `;

        card.querySelector('.switch-btn').onclick = async (e) => {
            e.preventDefault();
            
            const newPausedStatus = !site.paused;
            site.paused = newPausedStatus;
            
            if (newPausedStatus === false) { 
                if (site.type === 'dauer' && site.dauer > 0) {
                    site.remainingMinutes = site.dauer;
                }
            }
            
            y
            const allSites = await StorageManager.getSites();
            const index = allSites.findIndex(s => s.id == site.id);
            if (index !== -1) {
                allSites[index] = site;
                await StorageManager.saveSites(allSites);
            }
            
            renderList(); 
            
            chrome.runtime.sendMessage({ action: "checkRulesNow" });
        };
        card.querySelector('.btn-delete-item').onclick = async () => {
            await removeChromeRule(numericId);
            await StorageManager.deleteSite(numericId);
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
    const gesamtMinuten = (h * 60) + m;

    const data = {
        id: editModeId || Date.now(),
        url,
        type: isDauerView ? 'dauer' : 'bereich',
        paused: false,
        dauer: (isDauerView && gesamtMinuten > 0) ? gesamtMinuten : 0, 
        remainingMinutes: (isDauerView && gesamtMinuten > 0) ? gesamtMinuten : null,
        start: startTimeInput.value,
        end: endTimeInput.value
    };

    await StorageManager.saveSite(data, editModeId);
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
    addBtn.innerText = "Aktualisieren";
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
    addBtn.innerText = "Website blockieren";
    cancelBtn.style.display = "none";
}

document.addEventListener('DOMContentLoaded', init);