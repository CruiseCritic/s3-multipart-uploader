module.exports = {
    "env": {
        "browser": true,
        "es2021": true
    },
    "extends": "standard-with-typescript",
    "parserOptions": {
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "rules": {
        "@typescript-eslint/strict-boolean-expressions": "off",
        "@typescript-eslint/indent": ["error", 4],
        "@typescript-eslint/comma-dangle": ["error", "always-multiline"],
        "@typescript-eslint/space-before-function-paren": "off"
    }
}
