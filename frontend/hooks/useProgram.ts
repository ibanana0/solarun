'use client';

import { useMemo } from 'react';
import { Program, Idl } from '@coral-xyz/anchor';
import { useAnchorProvider } from './useAnchorProvider';
import IDL from '@/lib/solarun_temp.json';
import { SolarunTemp } from '@/lib/solarun_temp';

export function useProgram(): Program<SolarunTemp> | null {
    const provider = useAnchorProvider();

    const program = useMemo(() => {
        if (!provider) return null;
        return new Program<SolarunTemp>(IDL as any, provider);
    }, [provider]);

    return program;
}
