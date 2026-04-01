import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // In mock, just return a user based on token or default
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (token === 'mock-token') {
    return NextResponse.json({
      id: '1',
      email: 'admin@example.com',
      full_name: 'Admin User',
      role: 'ADMIN',
      is_active: true,
    });
  }
  return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
}
