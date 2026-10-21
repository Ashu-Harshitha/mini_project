import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoleGuard } from '@/components/RoleGuard';
import { useAppStore } from '@/store/useAppStore';

describe('RoleGuard Component', () => {
  beforeEach(() => {
    useAppStore.setState({
      user: null,
      isAuthResolved: true,
    });
  });

  it('renders loading indicator when auth is not resolved', () => {
    useAppStore.setState({ isAuthResolved: false });

    render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['farmer']}>
          <div>Protected Content</div>
        </RoleGuard>
      </MemoryRouter>
    );

    expect(screen.getByText('Loading session...')).toBeTruthy();
    expect(screen.queryByText('Protected Content')).toBeNull();
  });

  it('renders children when user role matches allowed roles', () => {
    useAppStore.setState({
      user: {
        id: 1,
        uid: 'user-1',
        username: 'farmer_john',
        displayName: 'Farmer John',
        email: 'john@example.com',
        role: 'farmer',
        language: 'en',
        avatarInitials: 'FJ',
      },
      isAuthResolved: true,
    });

    render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['farmer']}>
          <div>Farmer Dashboard Area</div>
        </RoleGuard>
      </MemoryRouter>
    );

    expect(screen.getByText('Farmer Dashboard Area')).toBeTruthy();
    expect(screen.queryByText('Access Restricted')).toBeNull();
  });

  it('renders Access Restricted when user role does not match allowed roles', () => {
    useAppStore.setState({
      user: {
        id: 2,
        uid: 'user-2',
        username: 'agronomist_sarah',
        displayName: 'Agronomist Sarah',
        email: 'sarah@example.com',
        role: 'agronomist',
        language: 'en',
        avatarInitials: 'AS',
      },
      isAuthResolved: true,
    });

    render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['admin']}>
          <div>Admin Only Zone</div>
        </RoleGuard>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Only Zone')).toBeNull();
    expect(screen.getByText('Access Restricted')).toBeTruthy();
    expect(screen.getByText(/admin/i)).toBeTruthy();
  });
});
