export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: TelegramUser;
    auth_date?: number;
    hash?: string;
    start_param?: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  expand(): void;
  close(): void;
  ready(): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export interface TelegramAdapterContext {
  isAvailable: boolean;
  initData: string;
  startParam: string | null;
  user: TelegramUser | null;
  colorScheme: 'light' | 'dark';
  viewportHeight: number;
  isExpanded: boolean;
  expand: () => void;
  ready: () => void;
  enableClosingConfirmation: () => void;
}

/**
 * Initializes and provides a safe abstraction over window.Telegram.WebApp.
 * Supports running inside Telegram or in standalone web browsers with mock fallback.
 */
export function getTelegramAdapter(): TelegramAdapterContext {
  const webApp = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

  if (webApp && webApp.initData) {
    return {
      isAvailable: true,
      initData: webApp.initData,
      startParam: webApp.initDataUnsafe?.start_param ?? null,
      user: webApp.initDataUnsafe?.user ?? null,
      colorScheme: webApp.colorScheme ?? 'dark',
      viewportHeight: webApp.viewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 800),
      isExpanded: Boolean(webApp.isExpanded),
      expand: () => {
        try {
          webApp.expand();
        } catch {
          // Ignore
        }
      },
      ready: () => {
        try {
          webApp.ready();
        } catch {
          // Ignore
        }
      },
      enableClosingConfirmation: () => {
        try {
          webApp.enableClosingConfirmation();
        } catch {
          // Ignore
        }
      },
    };
  }

  // Standalone browser fallback
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const mockStartParam = searchParams.get('startapp') || searchParams.get('roomId') || null;
  const mockUserId = searchParams.get('mockUser') || 'player-standalone';

  return {
    isAvailable: false,
    initData: '',
    startParam: mockStartParam,
    user: {
      id: 999999,
      first_name: 'Player',
      username: mockUserId,
    },
    colorScheme: 'dark',
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 800,
    isExpanded: true,
    expand: () => {},
    ready: () => {},
    enableClosingConfirmation: () => {},
  };
}
