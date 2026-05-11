'use client';

import { useMemo } from 'react';
import { Program } from '@coral-xyz/anchor';
import { useAnchorProvider } from './useAnchorProvider';
// Explicitly import the IDL that was just synced
import IDL from '../lib/solarun_idl.json';

export function useProgram(): Program | null {
    const provider = useAnchorProvider();

    const program = useMemo(() => {
        if (!provider) return null;
        // Use IDL as any to bypass static type generation which might be stale
        return new Program(IDL as any, provider);
    }, [provider]);

    return program;
}
