interface StatusPillProps {
  status: string;
  label: string;
}

export default function StatusPill({ status, label }: StatusPillProps) {
  const toneMap: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
    SIGNED_PARTY1: 'bg-amber-100 text-amber-700 border-amber-200',
    SIGNED_PARTY2: 'bg-blue-100 text-blue-700 border-blue-200',
    COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    RETURN_INITIATED: 'bg-orange-100 text-orange-700 border-orange-200',
    RETURN_SIGNED_PARTY1: 'bg-orange-100 text-orange-700 border-orange-200',
    RETURN_SIGNED_PARTY2: 'bg-orange-100 text-orange-700 border-orange-200',
    RETURNED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${toneMap[status] || toneMap.DRAFT}`}>{label}</span>;
}
