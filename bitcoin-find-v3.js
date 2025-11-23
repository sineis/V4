// bitcoin-find-v3.js - V3.2 Corrigido: Imports, selectedWallet
import { Worker } from 'worker_threads';
import fs from 'fs';
import chalk from 'chalk';
import os from 'os';

export class BitcoinFinder {
  constructor(wallets, ranges, options = {}) {
    this.wallets = wallets;
    this.ranges = ranges;
    this.walletsSet = new Set(wallets);
    this.numWorkers = options.numWorkers || os.cpus().length;
    this.workers = [];
    this.stats = {
      totalKeysChecked: 0,
      totalKeysFound: 0,
      startTime: null,
      totalMatches: [],
      totalKps: 0
    };
    this.shouldStop = false;
    this.outputFile = options.outputFile || 'keys.txt';
    this.lastKeyFile = options.lastKeyFile || 'Ultima_chave.txt';
    this.mode = options.mode || 1;
    this.bias = options.bias || 1;
    this.puzzleNum = options.puzzleNum || 0;
    this.selectedWallet = options.selectedWallet || null;
  }

  async search(min, max, callback) {
    this.stats.startTime = Date.now();

    console.log(chalk.cyan(`\n🚀 Modo ${this.mode} com ${this.numWorkers} workers`));
    console.log(chalk.yellow(`Puzzle ${this.puzzleNum} | Range: ${min} - ${max}`));
    if (this.mode === 2) console.log(chalk.yellow(`Bias: ${this.bias}`));
    if (this.selectedWallet) console.log(chalk.green(`Foco Carteira: ${this.selectedWallet}`));
    console.log(chalk.gray(`📈 Monitorando kps... (esperado: 1-6M kps)`));

    const promises = [];
    for (let i = 0; i < this.numWorkers; i++) {
      promises.push(this.createWorker(i, min, max, callback));
    }

    try {
      await Promise.all(promises);
      this.printFinalStats();
    } catch (err) {
      console.error(chalk.red('Erro:'), err.message);
    }
  }

  createWorker(workerIndex, min, max, callback) {
    return new Promise((resolve, reject) => {
      const workerPath = new URL('./worker-v3.js', import.meta.url).pathname;

      const worker = new Worker(workerPath, {
        workerData: {
          walletsSet: Array.from(this.walletsSet),
          workerIndex,
          totalWorkers: this.numWorkers,
          mode: this.mode,
          bias: this.bias,
          min: min.toString(),
          max: max.toString(),
          puzzleNum: this.puzzleNum,
          selectedWallet: this.selectedWallet
        }
      });

      worker.on('message', (msg) => {
        if (msg.type === 'ready') {
          worker.postMessage({
            type: 'start',
            min: min.toString(),
            max: max.toString()
          });
        } else if (msg.type === 'progress') {
          this.stats.totalKeysChecked += msg.keysChecked;
          this.stats.totalKps = (this.stats.totalKps + msg.keysPerSecond) / 2;
          msg.totalKeys = this.stats.totalKeysChecked;
          msg.mode = this.mode;
          msg.selectedWallet = this.selectedWallet;
          callback?.(msg);
        } else if (msg.type === 'match') {
          this.handleMatches(msg.matches, this.mode);
        } else if (msg.type === 'complete') {
          this.stats.totalKeysFound += msg.keysFound;
          console.log(chalk.green(`✓ Worker ${msg.workerIndex} - Modo ${this.mode} OK`));
          resolve();
        }
      });

      worker.on('error', reject);
      worker.on('exit', (code) => code !== 0 ? reject(new Error(`Code ${code}`)) : null);

      this.workers.push(worker);
    });
  }

  handleMatches(matches, mode) {
    for (const match of matches) {
      console.log(chalk.green(`\n🎉 ACHEI no Modo ${mode}!`));
      console.log(chalk.green(`Private Key: ${match.privateKey}`));
      console.log(chalk.green(`WIF: ${match.wif}`));
      console.log(chalk.cyan(`Address: ${match.address}`));
      if (this.selectedWallet) console.log(chalk.yellow(`Carteira Foco: ${this.selectedWallet}`));
      console.log(chalk.yellow(`kps no Hit: ${this.stats.totalKps.toFixed(0)}`));

      const line = `[Modo ${mode}] Private key: ${match.privateKey}, WIF: ${match.wif}, Address: ${match.address}${this.selectedWallet ? `, Foco: ${this.selectedWallet}` : ''}\n`;
      fs.appendFileSync(this.outputFile, line, 'utf8');
      console.log(chalk.yellow('✓ Salvo keys.txt'));

      this.stats.totalMatches.push(match);
    }
  }

  updateLastKey(key) {
    const line = `Puzzle ${this.puzzleNum} Modo ${this.mode} | Ultima: ${key} | kps: ${this.stats.totalKps.toFixed(0)}${this.selectedWallet ? ` | Foco: ${this.selectedWallet}` : ''}\n`;
    fs.appendFileSync(this.lastKeyFile, line, 'utf8');
  }

  stop() {
    this.shouldStop = true;
    this.workers.forEach(w => {
      w.postMessage({ type: 'stop' });
      w.terminate();
    });
  }

  printFinalStats() {
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    const avgKps = this.stats.totalKeysChecked / elapsed;

    console.log(chalk.cyan('\n' + '='.repeat(50)));
    console.log(chalk.cyan(`📊 FIM Modo ${this.mode} - Puzzle ${this.puzzleNum}`));
    console.log(chalk.cyan('='.repeat(50)));
    console.log(chalk.yellow(`Verificadas: ${this.stats.totalKeysChecked.toLocaleString('pt-BR')}`));
    console.log(chalk.yellow(`Encontradas: ${this.stats.totalKeysFound}`));
    console.log(chalk.yellow(`Tempo: ${elapsed.toFixed(2)}s`));
    console.log(chalk.yellow(`kps Médio: ${avgKps.toLocaleString('pt-BR')}`));
    if (this.selectedWallet) console.log(chalk.green(`Foco Carteira: ${this.selectedWallet}`));
    console.log(chalk.cyan('='.repeat(50)));
  }
}

export default BitcoinFinder;
