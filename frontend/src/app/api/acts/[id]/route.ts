import { NextResponse } from 'next/server';

// This would be imported from the main route.ts in a real app
// For now, we'll use a simple in-memory store
let acts = [
  {
    id: '1',
    template_id: 't1',
    party1_name: 'ООО "Рога и копыта"',
    party2_name: 'Иванов Иван Иванович',
    issue_date: '2025-03-20T00:00:00Z',
    item_name: 'Ноутбук Lenovo',
    item_serial: 'SN123456',
    receiver_email: 'ivanov@example.com',
    status: 'DRAFT',
    current_version: 1,
    created_by: '1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    template_id: 't1',
    party1_name: 'ООО "Техника"',
    party2_name: 'Петров Петр Петрович',
    issue_date: '2025-03-21T00:00:00Z',
    item_name: 'Монитор Dell',
    item_serial: 'SN789012',
    receiver_email: 'petrov@example.com',
    status: 'SIGNED_PARTY1',
    current_version: 1,
    created_by: '1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const act = acts.find((a) => a.id === params.id);
  if (!act) {
    return NextResponse.json({ detail: 'Act not found' }, { status: 404 });
  }
  return NextResponse.json(act);
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const actIndex = acts.findIndex((a) => a.id === params.id);
  if (actIndex === -1) {
    return NextResponse.json({ detail: 'Act not found' }, { status: 404 });
  }
  acts[actIndex] = {
    ...acts[actIndex],
    ...body,
    updated_at: new Date().toISOString(),
  };
  return NextResponse.json(acts[actIndex]);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const actIndex = acts.findIndex((a) => a.id === params.id);
  if (actIndex === -1) {
    return NextResponse.json({ detail: 'Act not found' }, { status: 404 });
  }
  acts.splice(actIndex, 1);
  return NextResponse.json({ message: 'Act deleted' });
}
