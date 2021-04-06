# babel-plugin-no-index-imports
This plugin can transform index imports into direct file imports.

For example, the plugin can transform imports such as
```js
import { Homepage } from '@components';
```

Into either default style or named imports targeting a specific file.
```js
import { Homepage } from '@components/Homepage';
```

This can/will improve tree-shaking and reduce bundle size.

## Installation
```
yarn add -D babel-plugin-no-index-imports
```

## Usage
Add following config in your `.babelrc`
```
{
  "plugins": [
    ["babel-plugin-no-index-imports", {
      "useDefaultImport": false,
      "prefixes": {
        "@components": "./src/workspaces",
        "@utils": "./src/utils"
      }
    }]
  ]
}
```