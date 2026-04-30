import { Badge } from '@/components/ui/badge';

type RunnerStatus = 'registered' | 'running' | 'finished' | 'disqualified';
type EventStatus = 'pending' | 'active' | 'completed' | 'settled';
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
};

export function StatusBadge({ status }: { status: Status }) {
    return (
        <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>
            {STATUS_LABEL[status] ?? status}
        </Badge>
    );
}
