import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageUploadButton } from './ImageUploadButton';

describe('ImageUploadButton', () => {
  it('calls onSelect for each chosen file', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ImageUploadButton onSelect={onSelect} disabled={false} />);
    const input = screen.getByLabelText(/add image/i, { selector: 'input' });
    const a = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    const b = new File([new Uint8Array([2])], 'b.jpg', { type: 'image/jpeg' });
    await user.upload(input, [a, b]);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect((onSelect.mock.calls[0]![0] as File).name).toBe('a.png');
    expect((onSelect.mock.calls[1]![0] as File).name).toBe('b.jpg');
  });

  it('respects the disabled prop', () => {
    const onSelect = vi.fn();
    render(<ImageUploadButton onSelect={onSelect} disabled />);
    const input = screen.getByLabelText(/add image/i, {
      selector: 'input',
    }) as HTMLInputElement;
    expect(input).toBeDisabled();
  });
});
