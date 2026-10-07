import { useCallback, useEffect, useState } from 'react';
import { DATA_VERSION_STORAGE_KEY } from '../services/api';
export function useApi(loader, dependencies = []) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const reload = useCallback(() => setRevision(value => value + 1), []);
    useEffect(() => {
        let active = true;
        const refreshWhenOtherTabChangesData = (event) => {
            if (event.key === DATA_VERSION_STORAGE_KEY)
                setRevision(value => value + 1);
        };
        window.addEventListener('storage', refreshWhenOtherTabChangesData);
        setLoading(true);
        setError('');
        loader().then(result => {
            if (active)
                setData(result);
        }).catch(reason => {
            if (active)
                setError(reason instanceof Error ? reason.message : 'Could not load data.');
        }).finally(() => {
            if (active)
                setLoading(false);
        });
        return () => {
            active = false;
            window.removeEventListener('storage', refreshWhenOtherTabChangesData);
        };
        // Loader identity is intentionally omitted; callers provide data dependencies explicitly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revision, ...dependencies]);
    return { data, loading, error, reload };
}
