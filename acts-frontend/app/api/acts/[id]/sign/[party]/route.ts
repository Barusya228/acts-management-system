import { NextResponse } from 'next/server';

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

export async function POST(
  request: Request,
  { params }: { params: { id: string; party: string } }
) {
  const actIndex = acts.findIndex((a) => a.id === params.id);
  if (actIndex === -1) {
    return NextResponse.json({ detail: 'Act not found' }, { status: 404 });
  }

  const body = await request.json();
  const { signature_data } = body;

  // Update status based on party
  if (params.party === 'party1') {
    acts[actIndex].status = 'SIGNED_PARTY1';
  } else if (params.party === 'party2') {
    acts[actIndex].status = acts[actIndex].status === 'SIGNED_PARTY1' ? 'COMPLETED' : 'SIGNED_PARTY2';
  }

  acts[actIndex].updated_at = new Date().toISOString();

  return NextResponse.json(acts[actIndex]);
}
