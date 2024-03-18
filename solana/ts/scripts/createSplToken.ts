import { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMint2Instruction } from "@solana/spl-token";
import {
  SystemProgram,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";

import { connection, getSigner } from "./env";
import { ledgerSignAndSend } from "./helpers";

const mintKeypair = Keypair.generate();

console.log("Creating mint account with keypair:", mintKeypair.publicKey.toBase58());

(async () => {
  const tokenConfig = {
    decimals: 9,
    name: "Test NTT Token",
    symbol: "TEST_NTT_TKN",
    uri: "https://thisisnot.arealurl/info.json",
  };
  const signer = await getSigner();
  const signerPk = new PublicKey(await signer.getAddress());

  const createAccountIx = SystemProgram.createAccount({
    fromPubkey: signerPk,
    newAccountPubkey: mintKeypair.publicKey,
    space: MINT_SIZE,
    lamports: await connection.getMinimumBalanceForRentExemption(MINT_SIZE),
    programId: TOKEN_PROGRAM_ID
  });

  const initMintIx = createInitializeMint2Instruction(
    mintKeypair.publicKey,
    tokenConfig.decimals,
    signerPk,
    signerPk, //signerPk,
    TOKEN_PROGRAM_ID,
  );

  return ledgerSignAndSend([createAccountIx, initMintIx], [mintKeypair]);
})();

