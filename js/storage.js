export const StorageManager = {
    async getSites() {
        const result = await chrome.storage.local.get(['blockedSites']);
        return result.blockedSites || [];
    },

    async saveSites(sites) {
        await chrome.storage.local.set({ blockedSites: sites });
    },

    async saveSite(data, editId = null) {
        let sites = await this.getSites();
        
        if (editId !== null) {
            const numericId = parseInt(editId);
            const index = sites.findIndex(s => parseInt(s.id) === numericId);
            
            if (index !== -1) {
                const oldSite = sites[index];
               
                let updatedData = { ...data, id: numericId };
                
                if (oldSite.dauer !== data.dauer) {
                    updatedData.remainingMinutes = data.dauer;
                } else {
                    updatedData.remainingMinutes = oldSite.remainingMinutes;
                }

                sites[index] = updatedData;
            }
        } 
        else {
            const existingIndex = sites.findIndex(s => s.url === data.url);
            
            if (existingIndex !== -1) {
                const existingId = sites[existingIndex].id;
                sites[existingIndex] = { ...data, id: existingId, paused: false };
            } else {
                const id = Math.floor(Date.now() / 1000); 
                sites.push({ ...data, id, paused: false });
            }
        }
        
        await this.saveSites(sites);
        return { success: true };
    },

    async deleteSite(id) {
        let sites = await this.getSites();
        const numericId = parseInt(id);
        sites = sites.filter(s => parseInt(s.id) !== numericId);
        await this.saveSites(sites);
    },

    async getTheme() {
        const result = await chrome.storage.local.get(['theme']);
        return result.theme || 'light';
    },

    async setTheme(theme) {
        await chrome.storage.local.set({ theme });
    },

    async getGlobalStatus() {
        const result = await chrome.storage.local.get(['globalActive']);
        return result.globalActive || false;
    },

    async setGlobalStatus(isActive) {
        await chrome.storage.local.set({ globalActive: isActive });
    }
};