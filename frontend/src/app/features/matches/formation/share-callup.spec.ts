import { canShareFile, copyCallupText, downloadImage, shareCallup } from './share-callup';

function fakeFile(): File {
  return new File(['x'], 'callup.png', { type: 'image/png' });
}

describe('canShareFile', () => {
  // Headless Chrome ships a real navigator.share/canShare inherited from
  // Navigator.prototype, which `delete navigator.share` can't remove (it's
  // not an own property) — shadow it with an own `undefined` instead so
  // each test starts from a clean, unsupported baseline.
  beforeEach(() => {
    (navigator as any).share = undefined;
    (navigator as any).canShare = undefined;
  });
  afterEach(() => {
    delete (navigator as any).share;
    delete (navigator as any).canShare;
  });

  it('is false when the browser has no share API at all', () => {
    expect(canShareFile(fakeFile())).toBeFalse();
  });

  it('is false when canShare rejects this file (e.g. desktop without a share target)', () => {
    (navigator as any).share = async () => {};
    (navigator as any).canShare = () => false;
    expect(canShareFile(fakeFile())).toBeFalse();
  });

  it('is true when the browser supports sharing this file', () => {
    (navigator as any).share = async () => {};
    (navigator as any).canShare = () => true;
    expect(canShareFile(fakeFile())).toBeTrue();
  });
});

describe('shareCallup', () => {
  afterEach(() => {
    delete (navigator as any).share;
  });

  it('returns "shared" when navigator.share resolves', async () => {
    (navigator as any).share = async () => {};
    expect(await shareCallup(fakeFile(), 'text', 'title')).toBe('shared');
  });

  it('returns "cancelled" when the user dismisses the native share sheet', async () => {
    (navigator as any).share = async () => {
      throw new DOMException('dismissed', 'AbortError');
    };
    expect(await shareCallup(fakeFile(), 'text', 'title')).toBe('cancelled');
  });

  it('returns "error" for any other failure', async () => {
    (navigator as any).share = async () => {
      throw new Error('boom');
    };
    expect(await shareCallup(fakeFile(), 'text', 'title')).toBe('error');
  });
});

describe('copyCallupText', () => {
  afterEach(() => {
    delete (navigator as any).clipboard;
  });

  it('returns true on success', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => {} },
      configurable: true,
    });
    expect(await copyCallupText('hola')).toBeTrue();
  });

  it('returns false when the clipboard write fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
      configurable: true,
    });
    expect(await copyCallupText('hola')).toBeFalse();
  });
});

describe('downloadImage', () => {
  it('creates a download anchor with the given data URL and filename', () => {
    const clickSpy = jasmine.createSpy('click');
    spyOn(document, 'createElement').and.returnValue({ click: clickSpy } as unknown as HTMLAnchorElement);

    downloadImage('data:image/png;base64,abc', 'convocatoria.png');

    expect(clickSpy).toHaveBeenCalled();
  });
});
