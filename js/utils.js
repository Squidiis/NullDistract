export function formatMinutes(minutes) {
    if (minutes === 0 || minutes === null || minutes === undefined) return "Unbegrenzt";
    
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

export function cleanUrl(url) {
    if (!url) return "";
    return url
        .trim()
        .toLowerCase()
        .replace(/^(?:https?:\/\/)?(?:www\.)?/i, "") 
        .split('/')[0]                               
        .split('?')[0];                            
}

export function isTimeNowInRange(start, end) {
    if (!start || !end) return false;
    
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    if (start <= end) {
        return currentTime >= start && currentTime <= end;
    } else {
        return currentTime >= start || currentTime <= end;
    }
}