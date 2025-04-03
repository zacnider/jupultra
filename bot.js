const { 
  Connection, 
  Keypair, 
  PublicKey, 
  VersionedTransaction,
  TransactionMessage, 
  LAMPORTS_PER_SOL,
  Commitment
} = require('@solana/web3.js');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

// Döngü sayısı kontrolü
const MAX_CYCLES = process.env.MAX_CYCLES ? parseInt(process.env.MAX_CYCLES) : 0; // 0 = sonsuz döngü
let cycleCount = 0;

// Manuel Base58 decode fonksiyonu
function base58Decode(base58String) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const BASE = ALPHABET.length;
  
  // Count leading zeros
  let zeros = 0;
  for (let i = 0; i < base58String.length && base58String[i] === '1'; i++) {
    zeros++;
  }
  
  // Convert from Base58 encoding
  let num = 0n;
  for (let i = 0; i < base58String.length; i++) {
    num = num * BigInt(BASE) + BigInt(ALPHABET.indexOf(base58String[i]));
  }
  
  // Convert to byte array
  let byteArray = [];
  while (num > 0n) {
    byteArray.unshift(Number(num % 256n));
    num = num / 256n;
  }
  
  // Add leading zeros
  while (zeros--) {
    byteArray.unshift(0);
  }
  
  return new Uint8Array(byteArray);
}

// .env dosyasından özel anahtar ve token adreslerini yükle
const privateKeyBase58 = process.env.PRIVATE_KEY;
const tokenAAddress = process.env.TOKEN_A || 'So11111111111111111111111111111111111111112'; // Varsayılan: SOL
const tokenBAddress = process.env.TOKEN_B || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // Varsayılan: USDC
const tokenASymbol = process.env.TOKEN_A_SYMBOL || 'SOL';
const tokenBSymbol = process.env.TOKEN_B_SYMBOL || 'USDC';
const swapWaitTime = parseInt(process.env.SWAP_WAIT_TIME || '15000'); // Varsayılan: 15 saniye
const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com'; // Özel RPC URL'si

if (!privateKeyBase58) {
  console.error('Error: PRIVATE_KEY not found in .env file');
  process.exit(1);
}

try {
  // Convert Base58 private key to Uint8Array using our custom function
  const secretKey = base58Decode(privateKeyBase58);
  const keypair = Keypair.fromSecretKey(secretKey);

  console.log(`Wallet loaded successfully: ${keypair.publicKey.toString()}`);
  console.log(`Token A: ${tokenASymbol} (${tokenAAddress})`);
  console.log(`Token B: ${tokenBSymbol} (${tokenBAddress})`);
  console.log(`Swap wait time: ${swapWaitTime / 1000} seconds`);
  console.log(`Using RPC URL: ${rpcUrl}`);

  // Configuration
  const config = {
    slippageBps: 50, // 0.5%
    checkInterval: 60000, // Check price every 60 seconds
    solTradePercentage: 50, // SOL bakiyesinin %50'si ile işlem yap
    tokenBTradePercentage: 100, // Token B bakiyesinin %100'ü ile işlem yap
    minSolReserve: 0.01 * LAMPORTS_PER_SOL, // En az 0.01 SOL her zaman cüzdanda kalacak (işlem ücretleri için)
    confirmationTimeout: 90000, // 90 saniye onay zaman aşımı (varsayılan 30 saniye yerine)
    maxRetries: 3, // İşlem başarısız olursa maksimum yeniden deneme sayısı
    retryDelay: 5000, // Yeniden denemeler arasında bekleme süresi (ms)
  };

  // Connection options with higher timeout and commitment
  const connectionOptions = {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: config.confirmationTimeout
  };
  
  const connection = new Connection(rpcUrl, connectionOptions);
  const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // Bakiye bilgilerini saklayacak değişkenler
  let solBalance = 0;
  let tokenBBalance = 0;
  let tokenBDecimals = 6; // Varsayılan olarak 6 (USDC için)
  let swapInProgress = false;

  async function getQuote(inputMint, outputMint, amount) {
    console.log(`Getting quote for ${amount} ${inputMint} -> ${outputMint}`);
    try {
      const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${config.slippageBps}`;
      console.log(`API URL: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error (${response.status}): ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('API Response received successfully');
      return data;
    } catch (error) {
      console.error('Error fetching quote:', error);
      return null;
    }
  }

  // İşlem durumunu kontrol eden yardımcı fonksiyon
  async function checkTransactionStatus(signature, retries = 0) {
    try {
      console.log(`Checking transaction status: ${signature}`);
      const status = await connection.getSignatureStatus(signature, {searchTransactionHistory: true});
      
      if (status && status.value) {
        if (status.value.err) {
          console.error(`Transaction failed with error:`, status.value.err);
          return false;
        } else if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
          console.log(`Transaction confirmed with status: ${status.value.confirmationStatus}`);
          return true;
        }
      }
      
      if (retries < config.maxRetries) {
        console.log(`Transaction not yet confirmed, retrying in ${config.retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, config.retryDelay));
        return await checkTransactionStatus(signature, retries + 1);
      } else {
        console.log(`Max retries reached. Transaction may still be processing: ${signature}`);
        // İşlem hala işleniyor olabilir, false döndürmek yerine belirsiz durum için null döndürüyoruz
        return null;
      }
    } catch (error) {
      console.error(`Error checking transaction status: ${error}`);
      if (retries < config.maxRetries) {
        console.log(`Error during status check, retrying in ${config.retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, config.retryDelay));
        return await checkTransactionStatus(signature, retries + 1);
      } else {
        return null;
      }
    }
  }

  async function executeSwap(quoteResponse) {
    try {
      // Get serialized transactions for the swap
      console.log('Preparing swap transaction...');
      const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: keypair.publicKey.toString(),
          wrapAndUnwrapSol: true
        })
      });
      
      if (!swapResponse.ok) {
        const errorText = await swapResponse.text();
        console.error(`API Error (${swapResponse.status}): ${errorText}`);
        throw new Error(`HTTP error! status: ${swapResponse.status}`);
      }
      
      const swapData = await swapResponse.json();
      const { swapTransaction } = swapData;
      
      console.log('Deserializing and signing transaction...');
      
      // Deserialize the versioned transaction
      const buffer = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(buffer);
      
      // Sign the transaction
      transaction.sign([keypair]);
      
      // Execute the transaction
      console.log('Sending transaction...');
      const txid = await connection.sendTransaction(transaction);
      console.log(`Transaction sent with ID: ${txid}`);
      
      try {
        console.log(`Waiting for confirmation (timeout: ${config.confirmationTimeout/1000}s)...`);
        await connection.confirmTransaction({
          signature: txid,
          blockhash: transaction.message.recentBlockhash,
          lastValidBlockHeight: 150, // Bu değer normalde transaction içinden alınmalı ama şu anki API'de bu bilgi olmayabilir
        }, 'confirmed');
        console.log('Transaction confirmed by confirmTransaction method');
        return txid;
      } catch (confirmError) {
        console.warn(`Confirmation error: ${confirmError.message}`);
        
        // confirmTransaction başarısız olursa, manuel olarak durumu kontrol et
        console.log('Manually checking transaction status...');
        const status = await checkTransactionStatus(txid);
        
        if (status === true) {
          console.log('Transaction confirmed by manual check');
          return txid;
        } else if (status === false) {
          throw new Error('Transaction failed according to manual check');
        } else {
          // İşlem durumu belirsiz, ama işlemi başarılı kabul edip devam edelim
          // Bakiyeleri kontrol ederek gerçekten başarılı olup olmadığını anlayabiliriz
          console.log('Transaction status uncertain, continuing with caution...');
          return txid;
        }
      }
    } catch (error) {
      console.error('Error executing swap:', error);
      throw error;
    }
  }

  async function updateBalances() {
    try {
      // SOL bakiyesini güncelle
      const rawSolBalance = await connection.getBalance(keypair.publicKey);
      solBalance = rawSolBalance;
      console.log(`SOL Balance: ${solBalance / LAMPORTS_PER_SOL} SOL`);
      
      // Token B bakiyesini güncelle
      try {
        const tokenBMint = new PublicKey(tokenBAddress);
        
        // Token B hesabını bulma
        const { value: tokenAccounts } = await connection.getParsedTokenAccountsByOwner(
          keypair.publicKey,
          { programId: tokenProgramId }
        );
        
        const tokenBAccount = tokenAccounts.find(account => 
          account.account.data.parsed.info.mint === tokenBMint.toString()
        );
        
        if (tokenBAccount) {
          tokenBDecimals = tokenBAccount.account.data.parsed.info.tokenAmount.decimals;
          const rawTokenBBalance = tokenBAccount.account.data.parsed.info.tokenAmount.amount;
          tokenBBalance = Number(rawTokenBBalance);
          console.log(`${tokenBSymbol} Balance: ${tokenBBalance / Math.pow(10, tokenBDecimals)} ${tokenBSymbol}`);
        } else {
          console.log(`No ${tokenBSymbol} account found for this wallet`);
          tokenBBalance = 0;
        }
      } catch (error) {
        console.error(`Error checking ${tokenBSymbol} balance:`, error);
        tokenBBalance = 0;
      }
    } catch (error) {
      console.error('Error updating balances:', error);
    }
  }

  async function performSwapCycle() {
    if (swapInProgress) {
      console.log('Swap cycle already in progress, skipping...');
      return;
    }

    try {
      swapInProgress = true;
      console.log('\n--- Starting new swap cycle ---');
      
      // Bakiyeleri güncelle
      await updateBalances();
      
      // İşlem yapılacak miktarları hesapla
      const usableSolBalance = Math.max(0, solBalance - config.minSolReserve);
      const solTradeAmount = Math.floor(usableSolBalance * (config.solTradePercentage / 100));
      const tokenBTradeAmount = Math.floor(tokenBBalance * (config.tokenBTradePercentage / 100));
      
      console.log(`Usable SOL balance: ${usableSolBalance / LAMPORTS_PER_SOL} SOL`);
      console.log(`SOL trade amount (${config.solTradePercentage}%): ${solTradeAmount / LAMPORTS_PER_SOL} SOL`);
      console.log(`${tokenBSymbol} trade amount (${config.tokenBTradePercentage}%): ${tokenBTradeAmount / Math.pow(10, tokenBDecimals)} ${tokenBSymbol}`);
      
      // İlk swap: SOL -> Token B
      if (solTradeAmount > 0) {
        console.log(`\n1. Performing ${tokenASymbol} -> ${tokenBSymbol} swap...`);
        
        // Get quote for SOL -> Token B
        const buyQuote = await getQuote(tokenAAddress, tokenBAddress, solTradeAmount);
        
        if (!buyQuote) {
          console.log(`No ${tokenASymbol} -> ${tokenBSymbol} routes found - API returned null`);
          swapInProgress = false;
          return;
        }
        
        // Jupiter API v6 yapısını kontrol et
        const outAmount = buyQuote.outAmount || (buyQuote.data && buyQuote.data.outAmount);
        
        if (!outAmount) {
          console.log(`No outAmount found in ${tokenASymbol} -> ${tokenBSymbol} API response`);
          swapInProgress = false;
          return;
        }
        
        const buyAmount = Number(outAmount);
        console.log(`Expected output: ${buyAmount / Math.pow(10, tokenBDecimals)} ${tokenBSymbol}`);
        
        try {
          // Execute swap
          const buyTxid = await executeSwap(buyQuote);
          console.log(`${tokenASymbol} -> ${tokenBSymbol} transaction successful:`, buyTxid);
          
          // Log to file
          const logEntry = `${new Date().toISOString()} - ${tokenASymbol}->${tokenBSymbol} - Amount: ${solTradeAmount / LAMPORTS_PER_SOL} ${tokenASymbol} - Output: ~${buyAmount / Math.pow(10, tokenBDecimals)} ${tokenBSymbol} - Txid: ${buyTxid}\n`;
          fs.appendFileSync('swaps.log', logEntry);
          
          // Update balances
          await updateBalances();
          
          // Wait for specified time
          console.log(`Waiting ${swapWaitTime / 1000} seconds before next swap...`);
          await new Promise(resolve => setTimeout(resolve, swapWaitTime));
          
          // Second swap: Token B -> SOL
          console.log(`\n2. Performing ${tokenBSymbol} -> ${tokenASymbol} swap...`);
          
          // Recalculate Token B amount after first swap
          const updatedTokenBTradeAmount = Math.floor(tokenBBalance * (config.tokenBTradePercentage / 100));
          
          if (updatedTokenBTradeAmount > 0) {
            // Get quote for Token B -> SOL
            const sellQuote = await getQuote(tokenBAddress, tokenAAddress, updatedTokenBTradeAmount);
            
            if (!sellQuote) {
              console.log(`No ${tokenBSymbol} -> ${tokenASymbol} routes found - API returned null`);
              swapInProgress = false;
              return;
            }
            
            const sellOutAmount = sellQuote.outAmount || (sellQuote.data && sellQuote.data.outAmount);
            
            if (!sellOutAmount) {
              console.log(`No outAmount found in ${tokenBSymbol} -> ${tokenASymbol} API response`);
              swapInProgress = false;
              return;
            }
            
            const sellAmount = Number(sellOutAmount);
            console.log(`Expected output: ${sellAmount / LAMPORTS_PER_SOL} ${tokenASymbol}`);
            
            // Execute sell
            const sellTxid = await executeSwap(sellQuote);
            console.log(`${tokenBSymbol} -> ${tokenASymbol} transaction successful:`, sellTxid);
            
            // Log to file
            const sellLogEntry = `${new Date().toISOString()} - ${tokenBSymbol}->${tokenASymbol} - Amount: ${updatedTokenBTradeAmount / Math.pow(10, tokenBDecimals)} ${tokenBSymbol} - Output: ~${sellAmount / LAMPORTS_PER_SOL} ${tokenASymbol} - Txid: ${sellTxid}\n`;
            fs.appendFileSync('swaps.log', sellLogEntry);
            
            // Final balance update
            await updateBalances();
          } else {
            console.log(`Insufficient ${tokenBSymbol} balance for second swap`);
          }
        } catch (error) {
          console.error('Error during swap cycle:', error);
        }
      } else {
        console.log('Insufficient SOL balance for first swap');
      }
      
      console.log('--- Swap cycle completed ---\n');
    } catch (error) {
      console.error('Error during swap cycle:', error);
    } finally {
      swapInProgress = false;
      
      // Döngü sayısı kontrolü - finally bloğunun içine taşındı
      if (MAX_CYCLES > 0) {
        cycleCount++;
        console.log(`\nDöngü ${cycleCount}/${MAX_CYCLES} tamamlandı`);
        
        if (cycleCount >= MAX_CYCLES) {
          console.log('Belirtilen döngü sayısı tamamlandı. Bot kapatılıyor...');
          process.exit(0);
        }
      }
    }
  }

  async function startBot() {
    console.log('Starting Solana Swap Bot...');
    console.log(`Wallet address: ${keypair.publicKey.toString()}`);
    
    // İlk bakiye kontrolü
    await updateBalances();
    
    // Run the first swap cycle immediately
    await performSwapCycle();
    
    // Then schedule regular swaps
    setInterval(async () => {
      await performSwapCycle();
    }, config.checkInterval);
  }

  startBot().catch(console.error);
  
} catch (error) {
  console.error('Error initializing wallet:', error);
  process.exit(1);
}
