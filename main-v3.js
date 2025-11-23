// main-v3.js - V3.2 Corrigido: Imports, Imports, Modos 1-8 + Per-Key
import ranges from './ranges.js';
import BitcoinFinder from './bitcoin-find-v3.js';
import walletsArray from './wallets.js';
import readline from 'readline';
import chalk from 'chalk';
import os from 'os';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let shouldStop = false;

function displayHeader() {
  console.clear();
  console.log("\x1b[38;2;250;128;114m" + "╔════════════════════════════════════════════════════════╗\n" +
    "║" + "\x1b[0m" + "\x1b[36m" + " ____ _____ ____ _____ ___ _ _ ____ _____ ____ " + "\x1b[0m" + "\x1b[38;2;250;128;114m" + "║\n" +
    "║" + "\x1b[0m" + "\x1b[36m" + " | __ )_ _/ ___| | ___|_ _| \\ | | _ \\| ____| _ \\ " + "\x1b[0m" + "\x1b[38;2;250;128;114m" + "║\n" +
    "║" + "\x1b[0m" + "\x1b[36m" + " | _ \\ | || | | |_ | || \\| | | | | _| | |_) | " + "\x1b[0m" + "\x1b[38;2;250;128;114m" + "║\n" +
    "║" + "\x1b[0m" + "\x1b[36m" + " | |_) || || |___ | _| | || |\\ | |_| | |___| _ < " + "\x1b[0m" + "\x1b[38;2;250;128;114m" + "║\n" +
    "║" + "\x1b[0m" + "\x1b[36m" + " |____/ |_| \\____| |_| |___|_| \\_|____/|_____|_| \\_\\ " + "\x1b[0m" + "\x1b[38;2;250;128;114m" + "║\n" +
    "║" + "\x1b[0m" + "\x1b[36m" + " " + "\x1b[0m" + "\x1b[38;2;250;128;114m" + "║\n" +
    "╚══════════════════════" + chalk.green("V3.2 - 8 MODOS + PER-KEY") + "\x1b[0m\x1b[38;2;250;128;114m══════╝" + "\x1b[0m");

  console.log(chalk.cyan(`\n💻 CPU Cores: ${os.cpus().length} | 📦 Carteiras: ${walletsArray.length}\n`));
}

function selectRange() {
  displayHeader();

  rl.question(chalk.cyan(`Escolha puzzle (1-160): `), (answer) => {
    const puzzleNum = parseInt(answer);
    if (puzzleNum < 1 || puzzleNum > 160) {
      console.log(chalk.bgRed('❌ Entre 1-160'));
      selectRange();
      return;
    }

    const range = ranges[puzzleNum - 1];
    let min = BigInt(range.min);
    let max = BigInt(range.max);

    console.log(chalk.green(`\n✓ Puzzle #${puzzleNum}`));
    console.log(chalk.yellow(`Range: ${min.toString()} - ${max.toString()}`));
    console.log(chalk.yellow(`Size: ${(max - min).toLocaleString('pt-BR')}`));

    let status = range.status === 1 ? chalk.red('❌ Resolvida') : chalk.green('✓ Aberta');
    console.log(chalk.cyan(`Status: ${status}`));

    selectMode(min, max, puzzleNum);
  });
}

function selectMode(min, max, puzzleNum) {
  console.log(chalk.cyan('\n🚀 MODOS DE BUSCA (1-5 Geral; 6-8 Per-Key Eficientes):'));
  console.log(chalk.cyan(`1 - Aleatório Puro`));
  console.log(chalk.cyan(`2 - Bias Fixo`));
  console.log(chalk.cyan(`3 - BSGS Aprox`));
  console.log(chalk.cyan(`4 - Kangaroo Walk`));
  console.log(chalk.cyan(`5 - Híbrido Adaptativo`));
  console.log(chalk.cyan(`6 - Per-Key BSGS (targeted por carteira)`));
  console.log(chalk.cyan(`7 - Targeted Rho (colisões por chave)`));
  console.log(chalk.cyan(`8 - Priority Hybrid (prioriza chave escolhida)`));

  rl.question(chalk.cyan('\nEscolha modo (1-8): '), (modeStr) => {
    const intMode = parseInt(modeStr);
    if (intMode < 1 || intMode > 8) {
      console.log(chalk.bgRed('❌ Modo 1-8'));
      selectMode(min, max, puzzleNum);
      return;
    }

    let bias = 0;
    if (intMode === 2) {
      rl.question(chalk.cyan('Bias (1-1e9): '), (biasStr) => {
        bias = parseInt(biasStr || '1');
        startSearch(min, max, intMode, bias, puzzleNum);
      });
    } else if (intMode >= 6) {
      if (walletsArray.length === 0) {
        console.log(chalk.yellow('⚠️ Sem carteiras em wallets.js. Usando geral.'));
        startSearch(min, max, intMode, 0, puzzleNum);
      } else {
        console.log(chalk.cyan('\nCarteiras disponíveis:'));
        walletsArray.forEach((wallet, i) => console.log(`  ${i+1}. ${wallet}`));
        rl.question(chalk.cyan('Escolha carteira (1-N, ou 0 para geral): '), (walletIdx) => {
          const idx = parseInt(walletIdx);
          const selectedWallet = idx > 0 ? walletsArray[idx - 1] : null;
          if (selectedWallet) console.log(chalk.green(`✓ Carteira: ${selectedWallet}`));
          startSearch(min, max, intMode, 0, puzzleNum, selectedWallet);
        });
      }
    } else {
      startSearch(min, max, intMode, 0, puzzleNum);
    }
  });
}

async function startSearch(min, max, mode, bias, puzzleNum, selectedWallet = null) {
  const finder = new BitcoinFinder(walletsArray, ranges, {
    numWorkers: os.cpus().length,
    outputFile: 'keys.txt',
    lastKeyFile: 'Ultima_chave.txt',
    mode: mode,
    bias: bias,
    puzzleNum: puzzleNum,
    selectedWallet: selectedWallet
  });

  process.on('SIGINT', () => {
    console.log(chalk.red('\n⚠️ Parando...'));
    finder.stop();
    rl.close();
    process.exit(0);
  });

  const progressCallback = (msg) => {
    if (msg.type === 'progress') {
      finder.updateLastKey(msg.lastKey);
      const kpsFormatted = msg.keysPerSecond.toLocaleString('pt-BR');
      console.log(chalk.cyan(`Modo ${msg.mode}: ${kpsFormatted} kps | Total: ${msg.totalKeys?.toLocaleString('pt-BR') || 'N/A'} | Chave: ${msg.lastKey.slice(0,16)}...`));
      if (msg.selectedWallet) console.log(chalk.yellow(`  ✓ Foco: ${msg.selectedWallet}`));
    }
  };

  console.log(chalk.green(`\n🔍 Iniciando Modo ${mode} na Puzzle ${puzzleNum}... (Per-Key se aplicável)`));
  await finder.search(min, max, progressCallback);

  console.log(chalk.yellow('\nFinalizado!'));
  rl.close();
}

selectRange();
