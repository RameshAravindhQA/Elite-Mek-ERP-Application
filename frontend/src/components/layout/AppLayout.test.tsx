import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test User', role: 'Admin', email: 'test@example.com' },
    isLoading: false,
    logout: vi.fn(),
  }),
}));

vi.mock('wouter', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocation: () => ['/', vi.fn()],
}));

vi.mock('@workspace/api-client-react', () => ({
  useListReminders: () => ({ data: { items: [] } }),
  getListRemindersQueryKey: () => ['reminders', { page: 1, limit: 10 }],
}));

describe('AppLayout', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('show-welcome-after-login', 'true');
  });

  it('renders the sidebar layout and children content', () => {
    render(
      <AppLayout>
        <div>Test Content</div>
      </AppLayout>,
    );

    expect(screen.getAllByText('Elite Mek').length).toBeGreaterThan(0);
    expect(screen.getByText(/excellence in engineering since 2020/i)).toBeInTheDocument();
    expect(screen.getByText(/test content/i)).toBeInTheDocument();
  });

  it('opens the welcome dialog after mount and shows the start button', async () => {
    render(
      <AppLayout>
        <div>Test Content</div>
      </AppLayout>,
    );

    expect(await screen.findByRole('button', { name: /start work/i }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/good (morning|afternoon|evening), test user/i)).toBeInTheDocument();
  });
});
