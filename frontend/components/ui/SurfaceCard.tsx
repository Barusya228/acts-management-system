import React from 'react';

interface SurfaceCardProps {
  children: React.ReactNode;
  className?: string;
}

export default function SurfaceCard({ children, className = '' }: SurfaceCardProps) {
  return <div className={`rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 ${className}`}>{children}</div>;
}
