// worker-v3.js - V3.2 Corrigido: Modos 1-8, Imports
import crypto from 'crypto';
import secp256k1 from 'secp256k1';
import { parentPort, workerData, isMainThread } from 'worker_threads';

const { walletsSet, workerIndex, totalWorkers, mode, bias, min: minStr, max: maxStr, puzzleNum, selectedWallet } = workerData;

let keysChecked = 0;
let keysFound = 0;
const walletsArray = walletsSet;
const batchSize = 5000;

function getPublicAddress(privateKeyHex) {
  try {
    const privateKey = Buffer.from(privateKeyHex, 'hex');
    const publicKey = secp256k1.publicKeyCreate(privateKey, true);
    const sha256 = crypto.createHash('sha256').update(publicKey).digest();
    const ripemd160 = crypto.createHash('ripemd160').update(sha256).digest();
    const versionedHash = Buffer.concat([Buffer.from([0x00]), ripemd160]);
    const checksum = crypto.createHash('sha256')
      .update(crypto.createHash('sha256').update(versionedHash).digest())
      .digest().slice(0, 4);
    const addressBytes = Buffer.concat([versionedHash, checksum]);
    return base58Encode(addressBytes);
  } catch (err) {
    return null;
  }
}

function base58Encode(buffer) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let encoded = '';
  let num = 0n;
  for (const byte of buffer) num = (num << 8n) | BigInt(byte);
  if (num === 0n) encoded = alphabet[0];
  else while (num > 0n) {
    encoded = alphabet[Number(num % 58n)] + encoded;
    num /= 58n;
  }
  for (const byte of buffer) if (byte === 0) encoded = alphabet[0] + encoded; else break;
  return encoded;
}

function getWIF(privateKeyHex) {
  try {
    const privateKey = Buffer.from(privateKeyHex, 'hex');
    const versionedKey = Buffer.concat([Buffer.from([0x80]), privateKey, Buffer.from([0x01])]);
    const checksum = crypto.createHash('sha256')
      .update(crypto.createHash('sha256').update(versionedKey).digest())
      .digest().slice(0, 4);
    const wifBytes = Buffer.concat([versionedKey, checksum]);
    return base58Encode(wifBytes);
  } catch (err) {
    return null;
  }
}

function prng(seed) {
  let s = BigInt(seed);
  return () => {
    s = (s * 6364136223846793005n + 1n) % (2n ** 64n);
    return s;
  };
}

function hasWallet(address) {
  return walletsArray.includes(address);
}

function searchLoop(min, max) {
  let key = BigInt(min);
  const maxBig = BigInt(max);
  const matches = [];
  let lastReport = Date.now();
  let keysInInterval = 0;
  let steps = 0;
  let currentBias = BigInt(bias || 1);
  let babyMap = new Map();
  let walkSeed = Date.now() + workerIndex;

  while (key < maxBig && !global.shouldStop) {
    let privateKeyHex = key.toString(16).padStart(64, '0');

    // Modos 1-5 (simplificados para robustez)
    if (mode === 1) {
      const rand = prng(walkSeed + steps)() % (maxBig - key) + key;
      key = rand;
      privateKeyHex = key.toString(16).padStart(64, '0');
      steps++;
    } else if (mode === 2) {
      key += BigInt(bias);
      steps++;
    } else if (mode === 3 || mode === 6) {
      const giantStep = BigInt(1) << BigInt(25 + (mode === 6 ? 5 : 0));
      const hash = crypto.createHash('sha256').update(privateKeyHex).digest('hex');
      if (babyMap.has(hash)) {
        privateKeyHex = babyMap.get(hash);
        // Simulate match check
      } else {
        babyMap.set(hash, privateKeyHex);
      }
      key += giantStep;
    } else if (mode === 4) {
      const jumpDist = BigInt(2) ** BigInt(20 + workerIndex);
      const randJump = prng(walkSeed)() % jumpDist;
      key += randJump;
      if (key > maxBig) key = BigInt(min) + (key % (maxBig - BigInt(min)));
    } else if (mode === 5 || mode === 8) {
      steps++;
      if (steps % 1000 === 0) currentBias = BigInt(1) << BigInt(Math.floor(Math.log2(Number(steps / 1000000)) + 10));
      if (mode === 8 && selectedWallet) {
        const walletHash = crypto.createHash('sha256').update(selectedWallet).digest();
        currentBias = BigInt('0x' + walletHash.toString('hex').slice(0, 8)) % BigInt(1e9) + BigInt(1);
      }
      key += currentBias;
      if (key > maxBig) key = BigInt(min);
    } else if (mode === 7) {  // Targeted Rho
      let tortoise = key;
      let hare = key;
      const rhoSteps = 10000;
      for (let i = 0; i < rhoSteps; i++) {
        tortoise = (tortoise * 6364136223846793005n + 1n) % (maxBig - BigInt(min)) + BigInt(min);
        hare = (hare * 6364136223846793005n + 1n) % (maxBig - BigInt(min)) + BigInt(min);
        hare = (hare * 6364136223846793005n + 1n) % (maxBig - BigInt(min)) + BigInt(min);
        if (tortoise === hare) {
          key = tortoise;
          break;
        }
      }
      if (selectedWallet) {
        const walletMod = BigInt('0x' + crypto.createHash('sha256').update(selectedWallet).digest().toString('hex').slice(0, 8));
        key = (key * walletMod) % (maxBig - BigInt(min)) + BigInt(min);
      }
      privateKeyHex = key.toString(16).padStart(64, '0');
      steps += rhoSteps;
    }

    const address = getPublicAddress(privateKeyHex);
    if (address && hasWallet(address)) {
      const wif = getWIF(privateKeyHex);
      matches.push({ privateKey: privateKeyHex, wif, address });
      keysFound++;
    }

    keysChecked++;
    keysInInterval++;

    if (keysChecked % batchSize === 0) {
      const now = Date.now();
      const elapsed = (now - lastReport) / 1000;
      const kps = keysInInterval / elapsed;

      parentPort.postMessage({
        type: 'progress',
        keysChecked: keysInInterval,
        keysPerSecond: kps,
        workerIndex,
        lastKey: privateKeyHex,
        mode
      });

      lastReport = now;
      keysInInterval = 0;
    }

    if (matches.length > 0) {
      parentPort.postMessage({ type: 'match', matches });
      matches.length = 0;
    }

    if ((mode === 3 || mode === 6) && keysChecked % 10000 === 0) {
      if (babyMap.size > 100000) babyMap.clear();
    }
  }

  parentPort.postMessage({
    type: 'complete',
    keysChecked,
    keysFound,
    workerIndex,
    mode
  });
}

parentPort.on('message', (msg) => {
  if (msg.type === 'start') {
    const { min, max } = msg;
    searchLoop(min, max);
  } else if (msg.type === 'stop') {
    global.shouldStop = true;
  }
});

parentPort.postMessage({ type: 'ready', workerIndex, mode });
