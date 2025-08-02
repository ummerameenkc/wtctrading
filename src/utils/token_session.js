const crypto = require('crypto');
const {days}  = require("../client_package.json");


let getCurrentISODT = () => {
  let dateObj = new Date();
  return dateObj.toISOString();
};

function getRandomSalt() {
  return crypto.randomBytes(8).toString('hex').slice(0, 16);
}

function mix(password, salt, timestamp) {
  return crypto.pbkdf2Sync(password + timestamp, salt, 1000, 64, 'sha512').toString('hex');
}

function generate(password) {
  const salt = getRandomSalt();
  const timestamp = getCurrentISODT();
  const hash = mix(password, salt, timestamp);
  return { salt, hash, timestamp };
}

function validate(password, hash, salt, timestamp) {
  const newHash = mix(password, salt, timestamp);
  return newHash === hash;
}

function isPasswordOldEnough(passwordInfo) {
  const oneYearInMilliseconds = days * 24 * 60 * 60 * 1000;
  const passwordAge = Date.now() - new Date(passwordInfo.timestamp).getTime();
  return passwordAge >= oneYearInMilliseconds;
}

module.exports = { validate, generate, isPasswordOldEnough };
