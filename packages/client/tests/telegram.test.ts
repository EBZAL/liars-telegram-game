import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getTelegramAdapter,
  triggerLethalShotHaptic,
  triggerBlankShotHaptic,
  triggerLiarCallHaptic,
  type TelegramWebApp,
} from '../src/telegram.js';

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

  it('triggers haptic feedback via window.Telegram.WebApp.HapticFeedback', () => {
    const impactMock = vi.fn();
    const notificationMock = vi.fn();

    window.Telegram = {
      WebApp: {
        HapticFeedback: {
          impactOccurred: impactMock,
          notificationOccurred: notificationMock,
          selectionChanged: vi.fn(),
        },
      } as unknown as TelegramWebApp,
    };

    triggerLethalShotHaptic();
    expect(impactMock).toHaveBeenCalledWith('heavy');
    expect(notificationMock).toHaveBeenCalledWith('error');

    triggerBlankShotHaptic();
    expect(impactMock).toHaveBeenCalledWith('light');

    triggerLiarCallHaptic();
    expect(notificationMock).toHaveBeenCalledWith('warning');
  });

  it('safely falls back without throwing when Telegram or HapticFeedback is undefined', () => {
    delete (window as { Telegram?: unknown }).Telegram;
    expect(() => triggerLethalShotHaptic()).not.toThrow();
    expect(() => triggerBlankShotHaptic()).not.toThrow();
    expect(() => triggerLiarCallHaptic()).not.toThrow();
  });

  it('extracts Telegram user and initData from window.location.hash when webApp.initData is empty', () => {
    delete (window as { Telegram?: unknown }).Telegram;
    window.location.hash = '#tgWebAppData=user%3D%257B%2522id%2522%253A778899%252C%2522first_name%2522%253A%2522Hassan%2522%257D%26auth_date%3D1700000000%26hash%3Dabcdef123456';

    const adapter = getTelegramAdapter();
    expect(adapter.isAvailable).toBe(true);
    expect(adapter.user?.id).toBe(778899);
    expect(adapter.user?.first_name).toBe('Hassan');
    expect(adapter.initData).toContain('778899');

    // Clean up
    window.location.hash = '';
    try {
      window.sessionStorage?.clear();
      window.localStorage?.clear();
    } catch {}
  });

  it('restores Telegram user and initData from storage across page reloads', () => {
    delete (window as { Telegram?: unknown }).Telegram;
    window.location.hash = '';
    const mockStorage: Record<string, string> = {
      'liars_deck_tg_init_data': 'query_id=test&user=%7B%22id%22%3A554433%2C%22first_name%22%3A%22Sara%22%7D',
      'liars_deck_tg_user': JSON.stringify({ id: 554433, first_name: 'Sara' }),
    };

    window.sessionStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => {},
      key: () => null,
      length: Object.keys(mockStorage).length,
    };

    const adapter = getTelegramAdapter();
    expect(adapter.isAvailable).toBe(true);
    expect(adapter.user?.id).toBe(554433);
    expect(adapter.user?.first_name).toBe('Sara');
  });
});
