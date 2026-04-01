import { NextResponse } from 'next/server';

// Mock users
const users = [
  {
    id: '1',
    email: 'admin@example.com',
    password: 'admin123',
    full_name: 'Admin User',
    role: 'ADMIN',
    is_active: true,
  },
  {
    id: '2',
    email: 'user@example.com',
    password: 'user123',
    full_name: 'Regular User',
    role: 'STAFF',
    is_active: true,
  },
];

export async function POST(request: Request) {
  const { email, password } = await request.json();
  const user = users.find((u) => u.email === email && u.password === password);
  if (!user) {
    return NextResponse.json({ detail: 'Invalid credentials' }, { status: 401 });
  }
  // Return a mock token (JWT not needed for mock)
  return NextResponse.json({
    access_token: 'mock-token',
    token_type: 'bearer',
  });
}
