import { Keypair, Connection, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { createInitializeMintInstruction, createAssociatedTokenAccountInstruction, getMinimumBalanceForRentExemptMint, MINT_SIZE, TOKEN_PROGRAM_ID, getAssociatedTokenAddress, mintTo, createAssociatedTokenAccount, getAccount } from '@solana/spl-token';
import { readFileSync } from 'fs';

const secret = Uint8Array.from(JSON.parse(readFileSync('/home/ubuntu/catclawpad/dev-wallets/authority.devnet.json','utf8')));
const kp = Keypair.fromSecretKey(secret);
const conn = new Connection('https://devnet.helius-rpc.com/?api-key=617b1c65-8d7f-4129-bdb9-f53e1d3f8ac4','confirmed');
console.log('wallet:', kp.publicKey.toBase58());
const bal0 = await conn.getBalance(kp.publicKey);
console.log('balance pre:', bal0/1e9, 'SOL');

const mint = Keypair.generate();
const ata = await getAssociatedTokenAddress(mint.publicKey, kp.publicKey);
const rent = await getMinimumBalanceForRentExemptMint(conn);

const tx = new Transaction().add(
  SystemProgram.createAccount({ fromPubkey: kp.publicKey, newAccountPubkey: mint.publicKey, space: MINT_SIZE, lamports: rent, programId: TOKEN_PROGRAM_ID }),
  createInitializeMintInstruction(mint.publicKey, 9, kp.publicKey, kp.publicKey),
);
const sig1 = await sendAndConfirmTransaction(conn, tx, [kp, mint], { commitment: 'confirmed' });
console.log('CREATE SIG:', sig1);

await createAssociatedTokenAccount(conn, kp, mint.publicKey, kp.publicKey);
console.log('ATA:', ata.toBase58());

const supply = 1_000_000_000n * 1_000_000_000n;
const sig2 = await mintTo(conn, kp, mint.publicKey, ata, kp, supply);
console.log('MINT SIG:', sig2);

const acct = await getAccount(conn, ata);
console.log('SUPPLY IN ATA:', Number(acct.amount) / 1e9, 'tokens');
const bal1 = await conn.getBalance(kp.publicKey);
console.log('balance post:', bal1/1e9, 'SOL · spent:', (bal0-bal1)/1e9, 'SOL');
console.log('EXPLORER: https://explorer.solana.com/address/'+mint.publicKey.toBase58()+'?cluster=devnet');
console.log('MINT:', mint.publicKey.toBase58());
