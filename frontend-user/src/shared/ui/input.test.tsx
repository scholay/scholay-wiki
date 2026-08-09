// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Input } from './input';

afterEach(() => cleanup());

function ControlledNumberInput({
  initial = '0',
  onChange,
}: {
  initial?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <Input
      aria-label="数字"
      type="number"
      value={value}
      onChange={(event) => {
        onChange?.(event.currentTarget.value);
        setValue(event.currentTarget.value);
      }}
    />
  );
}

describe('Input number behavior', () => {
  it('在业务 onChange 前去掉整数部分的多余前导 0，并且仍允许清空', () => {
    const observed = vi.fn();
    render(<ControlledNumberInput onChange={observed} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '010' } });
    expect(input.value).toBe('10');
    expect(observed).toHaveBeenLastCalledWith('10');

    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(observed).toHaveBeenLastCalledWith('');
  });

  it.each([
    ['000', '0'],
    ['000.5', '0.5'],
    ['0', '0'],
    ['0.25', '0.25'],
    ['-010', '-10'],
    ['-000.5', '-0.5'],
    ['001e3', '1e3'],
    ['1e003', '1e003'],
    ['.5', '.5'],
  ])('只规范前导 0：%s → %s', (raw, expected) => {
    render(<ControlledNumberInput initial="" />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;

    fireEvent.change(input, { target: { value: raw } });

    expect(input.value).toBe(expected);
  });

  it('聚焦时阻止 wheel 默认行为，不改值、不 blur，且继续调用业务 onWheel', () => {
    const onWheel = vi.fn();
    render(<Input aria-label="数字" type="number" defaultValue="10" onWheel={onWheel} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    input.focus();

    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    });
    const dispatched = input.dispatchEvent(wheel);

    expect(dispatched).toBe(false);
    expect(wheel.defaultPrevented).toBe(true);
    expect(input.value).toBe('10');
    expect(input.ownerDocument.activeElement).toBe(input);
    expect(onWheel).toHaveBeenCalledTimes(1);
  });

  it('未聚焦的数字框不拦截页面 wheel', () => {
    render(<Input aria-label="数字" type="number" defaultValue="10" />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true });

    expect(input.dispatchEvent(wheel)).toBe(true);
    expect(wheel.defaultPrevented).toBe(false);
  });

  it('普通文本框不拦截 wheel，仍调用业务 onWheel', () => {
    const onWheel = vi.fn();
    render(<Input aria-label="文本" value="010" readOnly onWheel={onWheel} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    input.focus();
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true });

    expect(input.dispatchEvent(wheel)).toBe(true);
    expect(wheel.defaultPrevented).toBe(false);
    expect(input.value).toBe('010');
    expect(input.ownerDocument.activeElement).toBe(input);
    expect(onWheel).toHaveBeenCalledTimes(1);
  });
});
