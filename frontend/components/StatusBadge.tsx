import { Badge } from '@/components/ui/badge';

type RunnerStatus = 'registered' | 'running' | 'finished' | 'disqualified';
type EventStatus = 'pending' | 'active' | 'completed' | 'settled' | 'Initialized' | 'Active' | 'Completed' | 'Settled';
type Status = RunnerStatus | EventStatus;

const STATUS_LABEL: Record<Status, string> = {
    registered:    'Terdaftar',
    running:       'Berlari',
    finished:      'Selesai',
    disqualified:  'Diskualifikasi',
    pending:       'Belum Mulai',
    active:        'Aktif',
    completed:     'Selesai',
    settled:       'Settled',
    Initialized:   'Terinisialisasi',
    Active:        'Aktif',
    Completed:     'Selesai',
    Settled:       'Settled',
};

const STATUS_VARIANT: Record<Status, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    registered:   'secondary',
    running:      'default',
    finished:     'default',
    disqualified: 'destructive',
    pending:      'secondary',
    active:       'default',
    completed:    'secondary',
    settled:      'outline',
    Initialized:  'secondary',
    Active:       'default',
    Completed:    'secondary',
    Settled:      'outline',
};

export function StatusBadge({ status }: { status: Status | string }) {
    const s = status as Status;
    return (
        <Badge variant={STATUS_VARIANT[s] ?? 'secondary'}>
            {STATUS_LABEL[s] ?? status}
        </Badge>
    );
}
