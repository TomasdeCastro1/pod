// Metro para monorepo npm workspaces: @app/shared se consume como fuente TS directa.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// shared/src importa './rut.js' (convención ESM de Node) pero el archivo es rut.ts.
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolve ?? context.resolveRequest;
  const isShared = context.originModulePath.startsWith(path.join(workspaceRoot, 'shared'));
  if (isShared && moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return resolve(context, moduleName.replace(/\.js$/, ''), platform);
    } catch {
      // cae al caso normal
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
