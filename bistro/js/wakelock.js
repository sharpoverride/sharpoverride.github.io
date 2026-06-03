window.wakeLockAPI = {
    wakeLock: null,

    requestWakeLock: async function () {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake Lock is active');
                this.wakeLock.addEventListener('release', () => {
                    console.log('Wake Lock was released');
                });
            } catch (err) {
                console.error(`${err.name}, ${err.message}`);
            }
        }
    },

    releaseWakeLock: async function () {
        if (this.wakeLock !== null) {
            await this.wakeLock.release();
            this.wakeLock = null;
        }
    }
};
