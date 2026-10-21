import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import '@/i18n';

describe('VoiceRecorder Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('displays permission error state when microphone access is denied', async () => {
    // Mock navigator.mediaDevices.getUserMedia rejecting with NotAllowedError
    const permissionError = new Error('Permission denied');
    permissionError.name = 'NotAllowedError';

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(permissionError),
      },
    });

    const mockSend = vi.fn();
    render(<VoiceRecorder onSend={mockSend} />);

    // Microphone button is present
    const recordBtn = screen.getByRole('button');
    expect(recordBtn).toBeTruthy();

    // Trigger recording
    fireEvent.click(recordBtn);

    // Expect the permission denied error message to appear
    await waitFor(() => {
      expect(
        screen.getByText(/Microphone access denied\. Please allow microphone permissions/i)
      ).toBeTruthy();
    });

    expect(mockSend).not.toHaveBeenCalled();
  });
});
