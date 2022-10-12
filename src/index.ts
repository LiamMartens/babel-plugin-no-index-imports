import pathLib from 'path';
import types, { ImportDeclaration, ImportSpecifier } from '@babel/types';
import { globbySync } from 'globby';
import type { NodePath } from '@babel/core';

type PluginType = {
  types: typeof types;
}

type ExportsType = Record<string, {
  dirname: string;
  file: string;
}[]>;

type State = {
  file: {
    opts: {
      filename: string;
    },
  },
  opts: {
    extensions?: string[];
    useDefaultImport?: boolean;
    stripFileExtension?: boolean;
    prefixes: Record<string, string>;
    extractName?: (filename: string, prefix: string, fullpath: string) => string;
    selectImport?: (importName: string, exports: ExportsType[string], member: ImportSpecifier) => ExportsType[string][number]
  };
}

type ExtractNameFn = (filename: string, prefix: string, fullpath: string) => string | null

const getExportsInDirectory = (dir: string, prefix: string, extensions: string[], extractName?: ExtractNameFn) => {
  const files = globbySync(`${dir}/**/*.(${extensions.join('|')})`);
  return files.reduce<ExportsType>((acc, file) => {
    const relative = pathLib.relative(dir, file);
    const filename = pathLib.basename(file);
    const name = extractName
      ? extractName(filename, prefix, file)
      : filename.replace(/\.[a-zA-Z_-]+$/, '');
    if (name !== null && name !== 'index') {
      const dirname = pathLib.dirname(pathLib.dirname(relative));
      if (!acc[name]) acc[name] = [];
      acc[name].push({
        dirname,
        file,
      });
    }
    return acc;
  }, {});
}

export default ({ types }: PluginType) => {
  let prefixes: Record<string, ReturnType<typeof getExportsInDirectory>> | null = null;

  return {
    visitor: {
      ImportDeclaration(path: NodePath<ImportDeclaration>, state: State) {
        if (!prefixes) {
          prefixes = Object.keys(state.opts.prefixes).reduce<Record<string, ReturnType<typeof getExportsInDirectory>>>((acc, prefix) => {
            acc[prefix] = getExportsInDirectory(pathLib.resolve(state.opts.prefixes[prefix]), prefix, state.opts.extensions ?? ['ts', 'tsx', 'js', 'jsx'], state.opts.extractName);
            return acc;
          }, {});
        }

        const source = path.node.source.value;
        const matchedPrefix = Object.keys(prefixes).find(p => source.startsWith(p));
        if (!!matchedPrefix) {
          const prefix = prefixes[matchedPrefix];
          const transforms: ImportDeclaration[] = [];
          const memberImports = path.node.specifiers?.filter(function (specifier) { return specifier.type === 'ImportSpecifier' }) ?? [];
          memberImports.forEach((member: ImportSpecifier) => {
            const importName = member.imported.type === 'StringLiteral' ? member.imported.value : member.imported.name;
            const importSpecifier = state.opts.useDefaultImport
              ? types.importDefaultSpecifier(types.identifier(importName))
              : types.importSpecifier(types.identifier(importName), types.identifier(importName));
            const directImport = prefix[importName]
            if (directImport && directImport.length > 0) {
              if (directImport.length > 1) {
                console.warn(`Multiple files in "${matchedPrefix}" are exporting the module "${importName}"`)
              }

              if (state.opts.selectImport) {
                const selectedImport = state.opts.selectImport(importName, directImport, member)
                transforms.push(types.importDeclaration(
                  [importSpecifier],
                  types.stringLiteral(pathLib.relative(
                    pathLib.dirname(state.file.opts.filename),
                    state.opts.stripFileExtension === false
                      ? selectedImport.file
                      : selectedImport.file.replace(/\.[a-zA-Z_-]+$/, '')
                  ))
                ));
              }
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