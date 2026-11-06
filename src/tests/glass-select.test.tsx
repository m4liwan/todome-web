import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Select } from '../components/Select';

describe('glass select', () => {
  function Harnessed() {
    const [v, setV] = useState('b');
    return (
      <>
        <Select value={v} onChange={setV} aria-label="Wahl">
          <option value="a">Alpha</option>
          <option value="b">Beta</option>
          <option value="c">Gamma</option>
        </Select>
        <output data-testid="out">{v}</output>
      </>
    );
  }

  it('shows the selected label and picks with the keyboard', () => {
    render(<Harnessed />);
    const box = screen.getByRole('combobox', { name: 'Wahl' });
    expect(box.textContent).toContain('Beta');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByTestId('out').textContent).toBe('c');
    expect(box.getAttribute('aria-expanded')).toBe('false');
  });

  it('picks with the mouse and supports type-ahead', () => {
    render(<Harnessed />);
    const box = screen.getByRole('combobox', { name: 'Wahl' });
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('option', { name: 'Alpha' }));
    expect(screen.getByTestId('out').textContent).toBe('a');
    fireEvent.keyDown(box, { key: 'g' });
    expect(screen.getByTestId('out').textContent).toBe('c');
  });
});
