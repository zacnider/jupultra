#!/usr/bin/env node
const { exec, spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

// ANSI renk kodları
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",
  
  fg: {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    crimson: "\x1b[38m"
  },
  
  bg: {
    black: "\x1b[40m",
    red: "\x1b[41m",
    green: "\x1b[42m",
    yellow: "\x1b[43m",
    blue: "\x1b[44m",
    magenta: "\x1b[45m",
    cyan: "\x1b[46m",
    white: "\x1b[47m",
    crimson: "\x1b[48m"
  }
};

// ASCII Sanat başlığı
function displayHeader() {
  console.clear();
  console.log(`${colors.fg.cyan}${colors.bright}
     _             _ _            _____              _ _             ____        _   
    | |_   _ _ __ (_) |_ ___ _ _|_   _| __ __ _  __| (_)_ __   __ _| __ )  ___ | |_ 
 _  | | | | | '_ \\| | __/ _ \\ '__|| || '__/ _\` |/ _\` | | '_ \\ / _\` |  _ \\ / _ \\| __|
| |_| | |_| | |_) | | ||  __/ |   | || | | (_| | (_| | | | | | (_| | |_) | (_) | |_ 
 \\___/ \\__,_| .__/|_|\\__\\___|_|   |_||_|  \\__,_|\\__,_|_|_| |_|\\__, |____/ \\___/ \\__|
            |_|                                               |___/                 
  ${colors.reset}${colors.fg.yellow}
  ╔════════════════════════════════════════════════════════════════════╗
  ║                 Automated Solana Token Trading Bot                 ║
  ║                Powered by Jupiter Aggregator API                   ║
  ╚════════════════════════════════════════════════════════════════════╝
  ${colors.reset}`);
}

// Readline arayüzü oluştur
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Botun çalışma durumunu kontrol et
function checkBotStatus(botProcess) {
  if (botProcess && !botProcess.killed) {
    return true; // Bot çalışıyor
  }
  return false; // Bot çalışmıyor
}

// Botu belirli bir döngü sayısı için çalıştır
function runBotWithCycles(cycles) {
  console.log(`${colors.fg.green}Bot ${cycles} döngü için başlatılıyor...${colors.reset}`);
  
  // Bot dosyasının yolunu belirle
  const botPath = path.join(__dirname, 'bot.js');
  
  if (!fs.existsSync(botPath)) {
    console.error(`${colors.fg.red}Hata: Bot dosyası (${botPath}) bulunamadı!${colors.reset}`);
    return process.exit(1);
  }
  
  // Botu çalıştır
  const botProcess = spawn('node', [botPath], {
    stdio: 'inherit',
    env: { ...process.env, MAX_CYCLES: cycles.toString() }
  });
  
  let cycleCount = 0;
  
  // Bot çıkış olayını dinle
  botProcess.on('exit', (code) => {
    if (code === 0) {
      console.log(`${colors.fg.green}Bot başarıyla ${cycles} döngüyü tamamladı.${colors.reset}`);
    } else {
      console.error(`${colors.fg.red}Bot hata ile sonlandı (Çıkış kodu: ${code})${colors.reset}`);
    }
    process.exit(code);
  });
  
  // Hata olayını dinle
  botProcess.on('error', (err) => {
    console.error(`${colors.fg.red}Bot başlatılırken hata oluştu: ${err.message}${colors.reset}`);
    process.exit(1);
  });
  
  // CTRL+C ve diğer sonlandırma sinyallerini yakala
  process.on('SIGINT', () => {
    console.log(`\n${colors.fg.yellow}Bot güvenli bir şekilde kapatılıyor...${colors.reset}`);
    if (checkBotStatus(botProcess)) {
      botProcess.kill('SIGINT');
    }
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  });
}

// Botu sonsuz döngü modunda çalıştır
function runBotInfinite() {
  console.log(`${colors.fg.green}Bot sonsuz döngü modunda başlatılıyor...${colors.reset}`);
  
  // Bot dosyasının yolunu belirle
  const botPath = path.join(__dirname, 'bot.js');
  
  if (!fs.existsSync(botPath)) {
    console.error(`${colors.fg.red}Hata: Bot dosyası (${botPath}) bulunamadı!${colors.reset}`);
    return process.exit(1);
  }
  
  // Botu çalıştır
  const botProcess = spawn('node', [botPath], {
    stdio: 'inherit'
  });
  
  // Bot çıkış olayını dinle
  botProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`${colors.fg.red}Bot beklenmeyen bir şekilde sonlandı (Çıkış kodu: ${code})${colors.reset}`);
      
      // 5 saniye bekleyip yeniden başlat
      console.log(`${colors.fg.yellow}Bot 5 saniye içinde yeniden başlatılacak...${colors.reset}`);
      setTimeout(() => {
        runBotInfinite();
      }, 5000);
    }
  });
  
  // Hata olayını dinle
  botProcess.on('error', (err) => {
    console.error(`${colors.fg.red}Bot başlatılırken hata oluştu: ${err.message}${colors.reset}`);
    
    // 5 saniye bekleyip yeniden başlat
    console.log(`${colors.fg.yellow}Bot 5 saniye içinde yeniden başlatılacak...${colors.reset}`);
    setTimeout(() => {
      runBotInfinite();
    }, 5000);
  });
  
  // CTRL+C ve diğer sonlandırma sinyallerini yakala
  process.on('SIGINT', () => {
    console.log(`\n${colors.fg.yellow}Bot güvenli bir şekilde kapatılıyor...${colors.reset}`);
    if (checkBotStatus(botProcess)) {
      botProcess.kill('SIGINT');
    }
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  });
}

// Ana menüyü göster
function showMainMenu() {
  displayHeader();
  console.log(`${colors.fg.cyan}Lütfen bir seçenek seçin:${colors.reset}`);
  console.log(`${colors.fg.white}1. Botu sonsuz döngü modunda çalıştır${colors.reset}`);
  console.log(`${colors.fg.white}2. Botu belirli sayıda döngü için çalıştır${colors.reset}`);
  console.log(`${colors.fg.white}3. Çıkış${colors.reset}`);
  
  rl.question(`${colors.fg.green}Seçiminiz (1-3): ${colors.reset}`, (answer) => {
    switch(answer.trim()) {
      case '1':
        rl.close();
        runBotInfinite();
        break;
      case '2':
        rl.question(`${colors.fg.green}Kaç döngü çalıştırmak istiyorsunuz?: ${colors.reset}`, (cycles) => {
          const cycleCount = parseInt(cycles.trim());
          if (isNaN(cycleCount) || cycleCount <= 0) {
            console.log(`${colors.fg.red}Geçersiz değer! Pozitif bir sayı giriniz.${colors.reset}`);
            setTimeout(showMainMenu, 1500);
          } else {
            rl.close();
            runBotWithCycles(cycleCount);
          }
        });
        break;
      case '3':
        console.log(`${colors.fg.yellow}Programdan çıkılıyor...${colors.reset}`);
        rl.close();
        break;
      default:
        console.log(`${colors.fg.red}Geçersiz seçenek! Lütfen 1-3 arasında bir değer girin.${colors.reset}`);
        setTimeout(showMainMenu, 1500);
    }
  });
}

// Uygulamayı başlat
showMainMenu();
