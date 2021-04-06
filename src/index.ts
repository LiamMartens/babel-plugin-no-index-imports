import fs from 'fs';
import path from 'path';
import globby from 'globby';
import types, { ImportDeclaration, ImportSpecifier, } from '@babel/types';
import type { NodePath } from '@babel/core';

type Config = {
  prefixes: Record<string, string>;
}

const getExportsInDirectory = (dir: string) => {
  type ExportsType = Record<string, {
    dirname: string;
    file: string;
  }[]>;

  const files = globby.sync(`${dir}/**/*.(ts|tsx)`);
  return files.reduce<ExportsType>((acc, file) => {
    const relative = file.replace(dir, '').replace(/\/*/, '');
    const filename = path.basename(file);
    const name = filename.substr(0, filename.lastIndexOf('.'));
    if (name !== 'index') {
      const dirname = path.dirname(path.dirname(relative));
      if (!acc[name]) acc[name] = [];
      acc[name].push({
        dirname,
        file,
      });
    }
    return acc;
  }, {});
}

export default (config: Config) => {
  const prefixes = Object.keys(config.prefixes).reduce<Record<string, ReturnType<typeof getExportsInDirectory>>>((acc, prefix) => {
    acc[prefix] = getExportsInDirectory(config.prefixes[prefix]);
    return acc;
  }, {});

  return {
    visitor: {
      ImportDeclaration(path: NodePath<ImportDeclaration>) {
        const source = path.node.source.value;
        const matchedPrefix = Object.keys(prefixes).find(p => source.startsWith(p));
        if (!!matchedPrefix) {
          const prefix = prefixes[matchedPrefix];
          const directory = source.substring(matchedPrefix.length).replace(/\/*/, '');
          const transforms = [];
          const memberImports = path.node.specifiers.filter(function (specifier) { return specifier.type === 'ImportSpecifier' });
          memberImports.forEach((member: ImportSpecifier) => {
            const importName = member.imported.type === 'StringLiteral' ? member.imported.value : member.imported.name;
            const importSpecifier = types.importSpecifier(types.identifier(importName), types.identifier(importName));
            const directImport = prefix[importName].filter(e => (
              e.dirname === directory
            ));
            if (directImport.length > 0) {
              transforms.push(types.importDeclaration(
                [importSpecifier],
                types.stringLiteral(directImport[0].file)
              ));
            }
          });
          if (transforms.length > 0) {
            path.replaceWithMultiple(transforms);
          }
        }
      }
    },
  };
}