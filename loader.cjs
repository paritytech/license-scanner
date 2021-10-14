const esm = require("./node_modules/ts-node/dist/esm")
const path = require("path")

const {
  resolve: tsNodeResolve,
  load,
  getFormat,
  transformSource,
} = esm.registerAndCreateEsmHooks()

const resolve = function (specifier, ...args) {
  if (specifier.startsWith("license-scanner/")) {
    return tsNodeResolve(path.join(__dirname, `${specifier}.ts`), ...args)
  }
  return tsNodeResolve(specifier, ...args)
}

module.exports = { load, getFormat, transformSource, resolve }
