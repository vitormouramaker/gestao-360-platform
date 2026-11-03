const crypto = require("crypto");

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

module.exports = { createId };
