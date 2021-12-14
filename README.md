swan-eslint-parser
----

Swan 模板解析器，将 Swan 模板解析成 AST 语法树，给代码检查工具和小程序编辑器插件使用。

修改自 vue 模板解析器：[vue-eslint-parser](https://github.com/vuejs/vue-eslint-parser)

主要功能：

1. 解析 swan 模板语法成 ast 语法树。
2. 提供兼容 eslint 的 ast 语法树格式，作为 eslint 代码检查工具的 parser。

## test

**更新测试用例**

test cases 在 test/fixtures 目录，在增加新的 features 之后，需要更新 test case。然后运行如下命令更新：

> npm run update-fixtures

**运行测试**

> npm run test

## publish

npm publish

