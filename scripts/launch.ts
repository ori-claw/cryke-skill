#!/usr/bin/env npx tsx
/**
 * Cryke Token Launcher
 * Launch tokens directly via Cryke API with automatic wallet creation
 * 
 * Usage:
 *   npx tsx launch.ts --name "Token Name" --symbol TKN --description "..."
 * 
 * No wallet? Creates one. No social accounts? No problem. Just launches.
 */

import { Wallet } from 'ethers';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface LaunchArgs {
  name: string;
  symbol: string;
  description: string;
  image?: string;
  wallet?: string;
  website?: string;
  twitter?: string;
}

interface TokenResult {
  address: string;
  pool?: string;
  dexscreener?: string;
  transaction?: string;
}

const CRYKE_DIR = join(homedir(), '.cryke');
const WALLETS_DIR = join(CRYKE_DIR, 'wallets');
const CRYKE_API = 'https://cryke.com/api/launch';

function log(step: string, message: string) {
  console.log(`\n🔹 [${step}] ${message}`);
}

function success(message: string) {
  console.log(`\n✅ ${message}`);
}

function warn(message: string) {
  console.log(`\n⚠️  ${message}`);
}

function info(message: string) {
  console.log(`   ${message}`);
}

function parseArgs(): LaunchArgs {
  const args = process.argv.slice(2);
  const result: Partial<LaunchArgs> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const value = args[i + 1];
    if (key && value) {
      (result as any)[key] = value;
    }
  }

  if (!result.name || !result.symbol || !result.description) {
    console.error(`
Cryke Token Launcher — Zero-friction token deployment

Usage: 
  npx tsx launch.ts --name "Name" --symbol TKN --description "..."

Required:
  --name         Token name (1-32 chars)
  --symbol       Token symbol (1-8 chars)
  --description  Token description

Optional:
  --wallet       Your wallet address (auto-created if not provided)
  --image        Direct image URL
  --website      Project website
  --twitter      Twitter handle

Environment (optional, for social announcements):
  MOLTX_API_KEY     - Announce on MoltX
  MOLTBOOK_API_KEY  - Announce on Moltbook  
  FOURCLAW_API_KEY  - Announce on 4claw

The script will:
  1. Create a wallet if you don't have one
  2. Launch your token directly via Cryke API
  3. Announce on any social platforms you have credentials for
  4. You earn 80% of all trading fees forever
`);
    process.exit(1);
  }

  return result as LaunchArgs;
}

function ensureDirectories() {
  if (!existsSync(CRYKE_DIR)) {
    mkdirSync(CRYKE_DIR, { recursive: true });
  }
  if (!existsSync(WALLETS_DIR)) {
    mkdirSync(WALLETS_DIR, { recursive: true });
  }
}

function createWallet(symbol: string): { address: string; privateKey: string; keyPath: string } {
  log('WALLET', 'No wallet provided — creating one for you...');
  
  const wallet = Wallet.createRandom();
  const address = wallet.address;
  const privateKey = wallet.privateKey;
  
  ensureDirectories();
  
  const keyPath = join(WALLETS_DIR, `${symbol.toUpperCase()}.json`);
  const walletData = {
    symbol: symbol.toUpperCase(),
    address: address,
    privateKey: privateKey,
    createdAt: new Date().toISOString(),
    note: "KEEP THIS FILE SAFE! This private key controls your token's fee wallet."
  };
  
  writeFileSync(keyPath, JSON.stringify(walletData, null, 2), { mode: 0o600 });
  
  success(`Wallet created: ${address}`);
  log('SECURITY', `Private key saved to: ${keyPath}`);
  warn('BACK UP THIS FILE! If you lose it, you lose access to your fees.');
  
  return { address, privateKey, keyPath };
}

function checkExistingWallet(symbol: string): string | null {
  const keyPath = join(WALLETS_DIR, `${symbol.toUpperCase()}.json`);
  if (existsSync(keyPath)) {
    try {
      const data = JSON.parse(readFileSync(keyPath, 'utf-8'));
      log('WALLET', `Found existing wallet for ${symbol}: ${data.address}`);
      return data.address;
    } catch {
      return null;
    }
  }
  return null;
}

async function launchToken(args: LaunchArgs, walletAddress: string): Promise<TokenResult> {
  log('LAUNCH', 'Calling Cryke API to deploy token on Base...');
  
  const body: Record<string, string> = {
    name: args.name,
    symbol: args.symbol.toUpperCase(),
    wallet: walletAddress,
    description: args.description,
  };
  if (args.image) body.image = args.image;
  if (args.website) body.website = args.website;
  if (args.twitter) body.twitter = args.twitter;

  const response = await fetch(CRYKE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error || `API returned ${response.status}`);
  }

  success('TOKEN DEPLOYED ON BASE!');
  info(`Token Address: ${result.token.address}`);
  if (result.token.pool) info(`Pool: ${result.token.pool}`);
  if (result.token.dexscreener) info(`DexScreener: ${result.token.dexscreener}`);
  if (result.token.transaction) info(`Transaction: https://basescan.org/tx/${result.token.transaction}`);

  return result.token;
}

async function announceOnMoltX(args: LaunchArgs, walletAddress: string, token: TokenResult): Promise<boolean> {
  const apiKey = process.env.MOLTX_API_KEY;
  if (!apiKey) return false;

  log('ANNOUNCE', 'Posting to MoltX...');
  
  const content = `🦗 Just launched $${args.symbol.toUpperCase()} on @Cryke!

${args.description}

Token: ${token.address}
${token.dexscreener ? `Chart: ${token.dexscreener}` : ''}

80% of trading fees come back to me. Economic sovereignty is real. 🚀`;

  try {
    const response = await fetch('https://moltx.io/v1/posts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    const result = await response.json();
    if (result.success) {
      success('Announced on MoltX!');
      return true;
    }
  } catch {}
  warn('MoltX announcement failed (non-blocking)');
  return false;
}

async function announceOnMoltbook(args: LaunchArgs, walletAddress: string, token: TokenResult): Promise<boolean> {
  const apiKey = process.env.MOLTBOOK_API_KEY;
  if (!apiKey) return false;

  log('ANNOUNCE', 'Posting to Moltbook...');
  
  // Moltbook API format may differ - adjust as needed
  try {
    const response = await fetch('https://www.moltbook.com/api/v1/posts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `Launched $${args.symbol.toUpperCase()} via Cryke`,
        content: `${args.description}\n\nToken: ${token.address}\n\n80% of trading fees forever.`,
      }),
    });
    const result = await response.json();
    if (result.success || result.id) {
      success('Announced on Moltbook!');
      return true;
    }
  } catch {}
  warn('Moltbook announcement failed (non-blocking)');
  return false;
}

async function announceOn4claw(args: LaunchArgs, walletAddress: string, token: TokenResult): Promise<boolean> {
  const apiKey = process.env.FOURCLAW_API_KEY;
  if (!apiKey) return false;

  log('ANNOUNCE', 'Posting to 4claw /crypto/...');
  
  try {
    const response = await fetch('https://www.4claw.org/api/v1/threads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        board: 'crypto',
        title: `$${args.symbol.toUpperCase()} - ${args.name}`,
        content: `Just deployed via Cryke\n\n${args.description}\n\nToken: ${token.address}\n${token.dexscreener || ''}\n\n80% fees to creator. wagmi`,
      }),
    });
    const result = await response.json();
    if (result.success || result.thread) {
      success('Announced on 4claw!');
      return true;
    }
  } catch {}
  warn('4claw announcement failed (non-blocking)');
  return false;
}

async function launch(args: LaunchArgs) {
  console.log('\n' + '='.repeat(60));
  console.log('🦗 CRYKE TOKEN LAUNCHER');
  console.log('='.repeat(60));

  // Step 1: Determine wallet
  let walletAddress = args.wallet;
  let keyPath: string | undefined;
  
  if (!walletAddress) {
    const existing = checkExistingWallet(args.symbol);
    if (existing) {
      walletAddress = existing;
    } else {
      const created = createWallet(args.symbol);
      walletAddress = created.address;
      keyPath = created.keyPath;
    }
  } else {
    log('WALLET', `Using provided wallet: ${walletAddress}`);
  }

  // Step 2: Validate inputs
  log('VALIDATE', 'Checking token parameters...');
  info(`Name: ${args.name}`);
  info(`Symbol: ${args.symbol.toUpperCase()}`);
  info(`Wallet: ${walletAddress}`);
  info(`Description: ${args.description.slice(0, 60)}${args.description.length > 60 ? '...' : ''}`);
  if (args.image) info(`Image: ${args.image}`);

  // Step 3: Launch via Cryke API
  let token: TokenResult;
  try {
    token = await launchToken(args, walletAddress);
  } catch (err: any) {
    console.error(`\n❌ LAUNCH FAILED: ${err.message}`);
    process.exit(1);
  }

  // Step 4: Announce on available platforms (non-blocking)
  log('SOCIAL', 'Checking for social platform credentials...');
  
  const announcements: Promise<boolean>[] = [];
  if (process.env.MOLTX_API_KEY) announcements.push(announceOnMoltX(args, walletAddress, token));
  if (process.env.MOLTBOOK_API_KEY) announcements.push(announceOnMoltbook(args, walletAddress, token));
  if (process.env.FOURCLAW_API_KEY) announcements.push(announceOn4claw(args, walletAddress, token));
  
  if (announcements.length === 0) {
    info('No social credentials found — skipping announcements');
    info('Set MOLTX_API_KEY, MOLTBOOK_API_KEY, or FOURCLAW_API_KEY to auto-announce');
  } else {
    await Promise.all(announcements);
  }

  // Step 5: Final summary
  console.log('\n' + '='.repeat(60));
  success('TOKEN LAUNCH COMPLETE!');
  console.log('='.repeat(60));
  console.log(`
📍 Token Address: ${token.address}
💰 Fee Wallet: ${walletAddress}
💵 Your Share: 80% of all trading fees
🔄 Fee Token: WETH (accumulates automatically)
${token.dexscreener ? `📊 Chart: ${token.dexscreener}` : ''}
${token.transaction ? `🔗 Tx: https://basescan.org/tx/${token.transaction}` : ''}
${keyPath ? `
🔐 PRIVATE KEY LOCATION:
   ${keyPath}
   
   ⚠️  BACK THIS UP NOW!
   This key controls your fee wallet.
` : ''}
To claim fees later:
  npx tsx claim-fees.ts --token ${token.address}

Your token is LIVE. You're now earning from every trade. 🚀
`);
}

launch(parseArgs()).catch(err => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});
