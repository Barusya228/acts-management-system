import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const party1 = searchParams.get('party1') || '';
  const party2 = searchParams.get('party2') || '';
  const item_name = searchParams.get('item_name') || '';
  const email = searchParams.get('email') || '';

  let filtered = acts.filter((act) => {
    return (
      act.party1_name.toLowerCase().includes(party1.toLowerCase()) &&
      act.party2_name.toLowerCase().includes(party2.toLowerCase()) &&
      act.item_name.toLowerCase().includes(item_name.toLowerCase()) &&
      act.receiver_email.toLowerCase().includes(email.toLowerCase())
    );
  });

  return NextResponse.json({
    items: filtered,
    total: filtered.length,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const newAct = {
    id: uuidv4(),
    ...body,
    status: 'DRAFT',
    current_version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  acts.push(newAct);
  return NextResponse.json(newAct, { status: 201 });
}
