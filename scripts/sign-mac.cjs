// electron-builder 26.0.12 does not implement identity: "-" directly.
// Use its existing signer, without a developer certificate or hardened runtime.
const { signAsync } = require("@electron/osx-sign");

module.exports = (options) =>
  signAsync({
    ...options,
    identity: "-",
    identityValidation: false,
    preAutoEntitlements: false,
  });
