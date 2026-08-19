// Forwards the app's relative /api/* calls to the backend during `ng
// serve`. Target is overridable via API_PROXY_TARGET so Playwright E2E can
// point a throwaway dev-server instance at the test backend instead of the
// one a developer might already have running for manual local dev.
const target = process.env.API_PROXY_TARGET || 'http://localhost:3000';

export default {
  '/api': {
    target,
    changeOrigin: true,
    secure: false,
  },
};
