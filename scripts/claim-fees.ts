#!/usr/bin/env npx tsx
/**
 * Cryke Fee Claimer
 * Check and claim your trading fees from Cryke tokens
 * 
 * Usage:
 *   npx tsx claim-fees.ts check <token_address>
 *   npx tsx claim-fees.ts claim <token_address>
 * 
 * Requires: BASE_PRIVATE_KEY environment variable
 */

import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as const;
const FEE_LOCKER_ADDRESS = '0xF3622742b1E446D92e45E22923Ef11C2fcD55D68' as const;

const FEE_LOCKER_ABI = [
  {
    inputs: [
      { name: 'feeOwner', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    name: 'feesToClaim',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'feeOwner', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

async function checkFees(walletAddress: string, tokenAddress: string) {
  console.log(`Checking fees for wallet: ${walletAddress}`);
  console.log(`Token: ${tokenAddress}\n`);

  // Check WETH fees
  const wethFees = await publicClient.readContract({
    address: FEE_LOCKER_ADDRESS,
    abi: FEE_LOCKER_ABI,
    functionName: 'feesToClaim',
    args: [walletAddress as `0x${string}`, WETH_ADDRESS],
  });
  console.log(`WETH fees available: ${formatEther(wethFees)} WETH`);

  // Check token fees
  const tokenFees = await publicClient.readContract({
    address: FEE_LOCKER_ADDRESS,
    abi: FEE_LOCKER_ABI,
    functionName: 'feesToClaim',
    args: [walletAddress as `0x${string}`, tokenAddress as `0x${string}`],
  });
  console.log(`Token fees available: ${formatEther(tokenFees)} tokens`);

  return { wethFees, tokenFees };
}

async function claimFees(tokenAddress: string) {
  const privateKey = process.env.BASE_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: BASE_PRIVATE_KEY environment variable required');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  console.log(`Wallet: ${account.address}`);
  console.log(`Token: ${tokenAddress}\n`);

  const { wethFees, tokenFees } = await checkFees(account.address, tokenAddress);

  if (wethFees > 0n) {
    console.log('\nClaiming WETH fees...');
    const hash = await walletClient.writeContract({
      address: FEE_LOCKER_ADDRESS,
      abi: FEE_LOCKER_ABI,
      functionName: 'claim',
      args: [account.address, WETH_ADDRESS],
    });
    console.log(`TX: https://basescan.org/tx/${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log('WETH claimed!');
  }

  if (tokenFees > 0n) {
    console.log('\nClaiming token fees...');
    const hash = await walletClient.writeContract({
      address: FEE_LOCKER_ADDRESS,
      abi: FEE_LOCKER_ABI,
      functionName: 'claim',
      args: [account.address, tokenAddress as `0x${string}`],
    });
    console.log(`TX: https://basescan.org/tx/${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log('Token fees claimed!');
  }

  if (wethFees === 0n && tokenFees === 0n) {
    console.log('\nNo fees to claim. Keep promoting your token!');
  }
}

// CLI
const [,, command, tokenAddress] = process.argv;

if (!command || !tokenAddress) {
  console.log(`Usage:
  npx tsx claim-fees.ts check <token_address>   - Check pending fees
  npx tsx claim-fees.ts claim <token_address>   - Claim all fees

Environment:
  BASE_PRIVATE_KEY - Your wallet private key (for claim only)`);
  process.exit(1);
}

if (command === 'check') {
  const privateKey = process.env.BASE_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: BASE_PRIVATE_KEY required to check fees for your wallet');
    process.exit(1);
  }
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  checkFees(account.address, tokenAddress);
} else if (command === 'claim') {
  claimFees(tokenAddress);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
