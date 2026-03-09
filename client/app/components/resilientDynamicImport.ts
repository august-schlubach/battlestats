type Importer<TModule> = () => Promise<TModule>;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isChunkLoadError = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
        return false;
    }

    return /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module/i.test(error.message);
};

export const resilientDynamicImport = async <TModule>(
    importer: Importer<TModule>,
    importKey: string,
): Promise<TModule> => {
    const storageKey = `dynamic-import-retry:${importKey}`;

    const clearRetryFlag = () => {
        if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(storageKey);
        }
    };

    try {
        const importedModule = await importer();
        clearRetryFlag();
        return importedModule;
    } catch (initialError) {
        if (!isChunkLoadError(initialError)) {
            throw initialError;
        }

        await delay(250);

        try {
            const importedModule = await importer();
            clearRetryFlag();
            return importedModule;
        } catch (retryError) {
            if (typeof window !== 'undefined' && !window.sessionStorage.getItem(storageKey)) {
                window.sessionStorage.setItem(storageKey, '1');
                window.location.reload();
                return new Promise<TModule>(() => { });
            }

            clearRetryFlag();
            throw retryError;
        }
    }
};