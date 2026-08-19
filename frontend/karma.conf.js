// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

// Resolve a headless Chromium if the system has no Chrome install and
// CHROME_BIN isn't already set (e.g. this dev machine, or a bare CI image) —
// falls back to the one `puppeteer` downloads on install. execFileSync
// because karma calls this file's export synchronously.
if (!process.env.CHROME_BIN) {
  try {
    const { execFileSync } = require('child_process');
    process.env.CHROME_BIN = execFileSync(
      process.execPath,
      ['-e', "require('puppeteer').executablePath().then(p => process.stdout.write(p))"],
      { cwd: __dirname, encoding: 'utf-8' }
    ).trim();
  } catch {
    // Leave CHROME_BIN unset — karma-chrome-launcher will fall back to its
    // own detection (or fail with a clear "set CHROME_BIN" error).
  }
}

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      jasmine: {},
      clearContext: false, // leave Jasmine Spec Runner output visible in browser
    },
    jasmineHtmlReporter: {
      suppressAll: true, // removes the duplicated traces
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }, { type: 'json-summary' }],
    },
    reporters: ['progress', 'kjhtml'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['Chrome'],
    customLaunchers: {
      // Runs headless with the sandbox disabled — needed in CI/containers,
      // where Chrome's setuid sandbox usually can't be set up.
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
    singleRun: false,
    restartOnFileChange: true,
  });
};
