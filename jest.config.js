/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/src/**/__test__/*.spec.{js,jsx,ts,tsx}', '!**/out/**'],
    collectCoverageFrom: [
        '**/src/**/*.{js,jsx,ts,tsx}',
        '!**/node_modules/**',
        '!**/out/**',
        '!**/coverage/**',
        '!**/jest.*',
        '!TestHelpers.ts',
    ],
    coverageThreshold: {
        global: {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100,
        },
    },
}
