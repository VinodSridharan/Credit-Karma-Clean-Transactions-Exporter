module.exports = [
    {
        files: ['TxVault/**/*.js', 'TxVault-Basic/**/*.js'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'script',
            globals: {
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                // Chrome Extension APIs
                chrome: 'readonly',
                browser: 'readonly'
            }
        },
        rules: {
            // Security-focused rules
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'eqeqeq': ['error', 'always'],
            'no-unused-vars': 'warn',
            
            // Console logging is common in extensions for debugging
            'no-console': 'off',
            
            // Additional code quality rules
            'no-var': 'warn',
            'prefer-const': 'warn',
            'no-trailing-spaces': 'warn',
            'semi': ['warn', 'always'],
            'quotes': ['warn', 'single', { avoidEscape: true }]
        }
    }
];

