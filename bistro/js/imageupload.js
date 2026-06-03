// Image Upload - Paste Handler
window.setupPasteHandler = (dotNetHelper) => {
    document.addEventListener('paste', async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const base64Data = event.target.result;
                        const fileName = `pasted-image-${Date.now()}.png`;
                        try {
                            await dotNetHelper.invokeMethodAsync('HandlePastedFile', base64Data, fileName);
                        } catch (error) {
                            console.error('Error handling pasted file:', error);
                        }
                    };
                    reader.readAsDataURL(blob);
                }
                break;
            }
        }
    });
};

// Drag and Drop Handler
window.setupDragDropHandler = (element, dotNetHelper) => {
    if (!element) return;

    element.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        if (!file.type.startsWith('image/')) {
            console.warn('Not an image file');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target.result;
            try {
                await dotNetHelper.invokeMethodAsync('HandlePastedFile', base64Data, file.name);
            } catch (error) {
                console.error('Error handling dropped file:', error);
            }
        };
        reader.readAsDataURL(file);
    });

    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
};
