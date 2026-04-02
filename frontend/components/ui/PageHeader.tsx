import React from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 px-5 py-4 text-white shadow-lg">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1">
          <div className="flex items-baseline gap-3">
            {eyebrow && (
              <span className="text-xs uppercase tracking-wider text-blue-300">{eyebrow}</span>
            )}
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
          </div>
          {description && <p className="mt-1 text-sm text-slate-300">{description}</p>}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
