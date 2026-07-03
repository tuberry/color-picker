// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

// based on https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/tools/eslint.config.js

import stylistic from '@stylistic/eslint-plugin';

const native = {
    'array-callback-return': 'error',
    'block-scoped-var': 'error',
    'camelcase': 'off',
    'curly': ['error', 'multi-or-nest', 'consistent'],
    'constructor-super': 'off',
    'eqeqeq': 'error',
    'func-name-matching': 'error',
    'func-style': [
        'error',
        'declaration',
        {
            allowArrowFunctions: true,
        },
    ],
    'max-nested-callbacks': 'error',
    'no-array-constructor': 'error',
    'no-await-in-loop': 'off',
    'no-caller': 'error',
    'no-constant-condition': [
        'error',
        {
            checkLoops: false,
        },
    ],
    'no-div-regex': 'error',
    'no-empty': [
        'error',
        {
            allowEmptyCatch: true,
        },
    ],
    'no-extra-bind': 'error',
    'no-invalid-this': 'off',
    'no-implicit-coercion': [
        'error',
        {
            allow: ['!!'],
        },
    ],
    'no-iterator': 'error',
    'no-label-var': 'error',
    'no-lonely-if': 'error',
    'no-loop-func': 'error',
    'no-nested-ternary': 'off',
    'no-new-object': 'error',
    'no-new-wrappers': 'error',
    'no-proto': 'error',
    'no-prototype-builtins': 'off',
    'no-restricted-globals': ['error', 'window'],
    'no-restricted-properties': [
        'error',
        {
            object: 'Lang',
            property: 'copyProperties',
            message: 'Use Object.assign()',
        },
        {
            object: 'Lang',
            property: 'bind',
            message: 'Use arrow notation or Function.prototype.bind()',
        },
        {
            object: 'Lang',
            property: 'Class',
            message: 'Use ES6 classes',
        },
    ],
    'no-restricted-syntax': [
        'error',
        {
            selector: 'MethodDefinition[key.name="_init"] > FunctionExpression[params.length=1] > BlockStatement[body.length=1] CallExpression[arguments.length=1][callee.object.type="Super"][callee.property.name="_init"] > Identifier:first-child',
            message: '_init() that only calls super._init() is unnecessary',
        },
        {
            selector: 'MethodDefinition[key.name="_init"] > FunctionExpression[params.length=0] > BlockStatement[body.length=1] CallExpression[arguments.length=0][callee.object.type="Super"][callee.property.name="_init"]',
            message: '_init() that only calls super._init() is unnecessary',
        },
        {
            selector: 'BinaryExpression[operator="instanceof"][right.name="Array"]',
            message: 'Use Array.isArray()',
        },
    ],
    'no-return-assign': 'error',
    'no-self-compare': 'error',
    'no-shadow': 'error',
    'no-shadow-restricted-names': 'error',
    'no-template-curly-in-string': 'error',
    'no-throw-literal': 'error',
    'no-undef-init': 'error',
    'no-unneeded-ternary': 'error',
    'no-unused-expressions': [
        'off',
        {
            allowShortCircuit: true,
            allowTernary: true,
        },
    ],
    'no-unused-vars': [
        'error',
        {
            caughtErrors: 'all',
            varsIgnorePattern: '(^unused|_$)',
            argsIgnorePattern: '^(unused|_)',
        },
    ],
    'no-useless-call': 'error',
    'no-useless-computed-key': 'error',
    'no-useless-concat': 'error',
    'no-useless-constructor': 'error',
    'no-useless-rename': 'error',
    'no-useless-return': 'error',
    'no-with': 'error',
    'object-shorthand': 'error',
    'operator-assignment': 'error',
    'prefer-arrow-callback': 'error',
    'prefer-const': 'off',
    'prefer-destructuring': 'error',
    'prefer-numeric-literals': 'error',
    'prefer-promise-reject-errors': 'error',
    'prefer-rest-params': 'error',
    'prefer-spread': 'error',
    'prefer-template': 'error',
    'require-await': 'error',
    'symbol-description': 'error',
    'unicode-bom': 'error',
    'yoda': 'error',
};

const plugin = {
    '@stylistic/array-bracket-newline': ['error', 'consistent'],
    '@stylistic/array-bracket-spacing': ['error', 'never'],
    '@stylistic/arrow-parens': ['error', 'as-needed'],
    '@stylistic/arrow-spacing': 'error',
    '@stylistic/block-spacing': 'error',
    '@stylistic/brace-style': [
        'error',
        '1tbs',
        {
            allowSingleLine: true,
        },
    ],
    '@stylistic/comma-dangle': [
        'error',
        {
            arrays: 'always-multiline',
            objects: 'always-multiline',
            functions: 'never',
        },
    ],
    '@stylistic/comma-spacing': [
        'error',
        {
            before: false,
            after: true,
        },
    ],
    '@stylistic/comma-style': ['error', 'last'],
    '@stylistic/computed-property-spacing': 'error',
    '@stylistic/dot-location': ['error', 'property'],
    '@stylistic/eol-last': 'error',
    '@stylistic/function-call-spacing': 'error',
    '@stylistic/indent': [
        'error',
        4,
        {
            SwitchCase: 0,
            ignoredNodes: [
                'CallExpression[callee.object.name=GObject][callee.property.name=registerClass] > ClassExpression:first-child',
            ],
            MemberExpression: 'off',
        },
    ],
    '@stylistic/key-spacing': [
        'error',
        {
            mode: 'minimum',
            beforeColon: false,
            afterColon: true,
        },
    ],
    '@stylistic/keyword-spacing': [
        'error',
        {
            before: true,
            after: true,
            overrides: {
                if: {
                    after: false,
                },
                switch: {
                    after: false,
                },
                while: {
                    after: false,
                },
                for: {
                    after: false,
                },
            },
        },
    ],
    '@stylistic/linebreak-style': ['error', 'unix'],
    '@stylistic/lines-between-class-members': [
        'error',
        'always',
        {
            exceptAfterSingleLine: true,
        },
    ],
    '@stylistic/max-len': ['error', {
        'code': 200,
        'ignoreUrls': true,
        'ignoreStrings': true,
        'ignoreRegExpLiterals': true,
        'ignoreTemplateLiterals': true,
        'ignoreTrailingComments': true,
    }],
    '@stylistic/max-statements-per-line': [
        'error',
        {
            max: 4,
        },
    ],
    '@stylistic/new-parens': 'error',
    '@stylistic/no-extra-parens': [
        'error',
        'all',
        {
            conditionalAssign: false,
            nestedBinaryExpressions: false,
            returnAssign: false,
        },
    ],
    '@stylistic/no-tabs': 'error',
    '@stylistic/no-trailing-spaces': 'error',
    '@stylistic/no-whitespace-before-property': 'error',
    '@stylistic/nonblock-statement-body-position': ['error', 'beside'],
    '@stylistic/object-curly-newline': [
        'error',
        {
            consistent: true,
            multiline: true,
        },
    ],
    '@stylistic/object-curly-spacing': ['error', 'never'],
    '@stylistic/operator-linebreak': 'error',
    '@stylistic/padded-blocks': ['error', 'never'],
    '@stylistic/quotes': [
        'error',
        'single',
        {
            avoidEscape: true,
        },
    ],
    '@stylistic/rest-spread-spacing': 'error',
    '@stylistic/semi': ['error', 'always'],
    '@stylistic/semi-spacing': [
        'error',
        {
            before: false,
            after: true,
        },
    ],
    '@stylistic/semi-style': 'error',
    '@stylistic/space-before-blocks': 'error',
    '@stylistic/space-before-function-paren': [
        'error',
        {
            named: 'never',
            catch: 'never',
            anonymous: 'always',
            asyncArrow: 'always',
        },
    ],
    '@stylistic/space-in-parens': 'error',
    '@stylistic/space-infix-ops': [
        'error',
        {
            int32Hint: false,
        },
    ],
    '@stylistic/space-unary-ops': 'off',
    '@stylistic/spaced-comment': 'error',
    '@stylistic/switch-colon-spacing': 'error',
    '@stylistic/template-curly-spacing': 'error',
    '@stylistic/template-tag-spacing': 'error',
    '@stylistic/wrap-iife': ['error', 'inside'],
    '@stylistic/yield-star-spacing': 'error',
};

const globals = {
    global: 'readonly',
    ARGV: 'readonly',
    Debugger: 'readonly',
    GIRepositoryGType: 'readonly',
    globalThis: 'readonly',
    imports: 'readonly',
    Intl: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    window: 'readonly',
    TextEncoder: 'readonly',
    TextDecoder: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    setInterval: 'readonly',
    clearTimeout: 'readonly',
    clearInterval: 'readonly',
};

export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'bin/**', 'build/**'],
    },
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals,
        },
        plugins: {
            '@stylistic': stylistic,
        },
        rules: {
            ...plugin,
            ...native,
        },
        settings: {
            jsdoc: {
                mode: 'typescript',
            },
        },
    },
];
