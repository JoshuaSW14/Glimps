import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        strict: false, // relax for test files
        noUnusedLocals: false,
        noUnusedParameters: false,
        noImplicitReturns: false,
      },
    }],
  },
  testTimeout: 30000,
  forceExit: true,
};

export default config;
