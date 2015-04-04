var path  = require("path");

function log(/*args*/) {
  if (log.debug) console.log.apply(console, arguments);
}

log.debug = false;

function uniq(arr) {
  return arr.reduce(function(all, ea) {
    if (all.indexOf(ea) === -1) all.push(ea);
    return all;
  }, []);
}

function noLastSlash(name) {
  var last = name[name.length-1];
  return (last === '/' || last === '\\') ?
    name.slice(0,-1) : name;
}

function relativePath(dir, fullPath) {
  var rel = path.relative(dir, fullPath);
  if (rel === '') rel = '.';
  return rel;
}

module.exports.log = log;
module.exports.uniq = uniq;
module.exports.noLastSlash = noLastSlash;
module.exports.relativePath = relativePath;
