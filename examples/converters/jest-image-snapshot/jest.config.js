module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // one browser per file, started in beforeAll
  testTimeout: 60_000,
};
