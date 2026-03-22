module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.(spec|test)\\.ts$",
  testEnvironment: "node",
  forceExit: true,
  openHandlesTimeout: 5000,
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  collectCoverageFrom: [
    "**/*.(t|j)s",
    "!**/*.d.ts",
    "!**/node_modules/**",
    "!**/dist/**",
  ],
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/test-setup.ts"],
};
