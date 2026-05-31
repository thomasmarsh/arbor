import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('jsdom browser environment smoke test', () => {
  it('window.location is accessible', () => {
    expect(window.location).toBeDefined();
    expect(typeof window.location.href).toBe('string');
  });

  it('history.pushState updates location.pathname', () => {
    history.pushState(null, '', '/test-path');
    expect(window.location.pathname).toBe('/test-path');
  });

  it('history.replaceState updates location.pathname', () => {
    history.replaceState(null, '', '/replaced');
    expect(window.location.pathname).toBe('/replaced');
  });

  describe('popstate event', () => {
    beforeEach(() => {
      history.pushState(null, '', '/first');
      history.pushState(null, '', '/second');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('fires on history.back()', () =>
      new Promise<void>((resolve) => {
        window.addEventListener(
          'popstate',
          (e) => {
            expect(e).toBeInstanceOf(PopStateEvent);
            resolve();
          },
          { once: true },
        );
        history.back();
      }));
  });
});
