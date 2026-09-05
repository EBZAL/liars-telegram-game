import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTelegramAdapter, type TelegramWebApp } from '../src/telegram.js';

describe('T-035 Telegram Adapter', () => {
  const originalTelegram = window.Telegram;

  beforeEach(() => {
    delete (window as { Telegram?: unknown }).Telegram;
  });

  afterEach(() => {
    if (originalTelegram) {
      window.Telegram = originalTelegram;
    } else {
      delete (window as { Telegram?: unknown }).Telegram;
    }
  });

  it('uses fallback context when window.Telegram is undefined', () => {
    const adapter = getTelegramAdapter();
    expect(adapter.isAvailable).toBe(false);
    expect(adapter.initData).toBe('');
    expect(adapter.user).not.toBeNull();
    expect(adapter.user?.username).toBe('player-standalone');
    expect(adapter.colorScheme).toBe('dark');
    expect(adapter.isExpanded).toBe(true);

    // Methods should not throw
    expect(() => adapter.ready()).not.toThrow();
    expect(() => adapter.expand()).not.toThrow();
    expect(() => adapter.enableClosingConfirmation()).not.toThrow();
  });

  it('binds to window.Telegram.WebApp when available', () => {
    const readyMock = vi.fn();
    const expandMock = vi.fn();
    const enableClosingMock = vi.fn();

    const mockWebApp: Partial<TelegramWebApp> = {
      initData: 'query_id=123&user=%7B%22id%22%3A42%2C%22first_name%22%3A%22Alice%22%7D',
      initDataUnsafe: {
        user: { id: 42, first_name: 'Alice', username: 'alice_tg' },
        start_param: 'r_game_123',
      },
      colorScheme: 'dark',
      themeParams: { bg_color: '#111111' },
      isExpanded: true,
      viewportHeight: 750,
      viewportStableHeight: 750,
      ready: readyMock,
      expand: expandMock,
      enableClosingConfirmation: enableClosingMock,
    };

    window.Telegram = {
      WebApp: mockWebApp as TelegramWebApp,
    };

    const adapter = getTelegramAdapter();
    expect(adapter.isAvailable).toBe(true);
    expect(adapter.initData).toBe(mockWebApp.initData);
    expect(adapter.startParam).toBe('r_game_123');
    expect(adapter.user?.id).toBe(42);
    expect(adapter.user?.first_name).toBe('Alice');
    expect(adapter.viewportHeight).toBe(750);

    adapter.ready();
    expect(readyMock).toHaveBeenCalledTimes(1);

    adapter.expand();
    expect(expandMock).toHaveBeenCalledTimes(1);

    adapter.enableClosingConfirmation();
    expect(enableClosingMock).toHaveBeenCalledTimes(1);
  });
});
