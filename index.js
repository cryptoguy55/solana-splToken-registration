require('dotenv').config()
const { program } = require("commander");
const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = require('@solana/spl-token');
const { clusterApiUrl, Connection, Keypair, sendAndConfirmTransaction, PublicKey, Transaction } = require('@solana/web3.js');
const { findMetadataPda   } =  require("@metaplex-foundation/js")
const fs = require("fs")
const bs58 = require("bs58");
const os = require("os")
const {
  createCreateMetadataAccountV3Instruction,
} = require("@metaplex-foundation/mpl-token-metadata");
const { sign } = require('crypto');
let SECRET_KEY = process.env.ADMIN_WALLET_PRIVATE_KEY
const wallet = Keypair.fromSecretKey(bs58.decode(SECRET_KEY));
const connection = new Connection(
  clusterApiUrl(process.env.CLUSTER),
  'confirmed'
);

program.version("0.0.1")

const createToken = async () => {
  const mint = await createMint(
    connection,
    wallet,
    wallet.publicKey,
    wallet.publicKey,
    6
  );
  
  console.log(mint.toBase58());

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet,
    mint,
    wallet.publicKey
  )
  
  await mintTo(
    connection,
    wallet,
    mint,
    tokenAccount.address,
    wallet,
    6666666666666  * 10 ** 6// because decimals for the mint are set to 9 
  )

  const ENV_VARS = fs.readFileSync("./.env", "utf8").split(os.EOL);

  // find the env we want based on the key
  const target = ENV_VARS.indexOf(ENV_VARS.find((line) => {
      return line.match(new RegExp("ADDRESS"));
  }));

  // replace the key/value with the new value
  ENV_VARS.splice(target, 1, `ADDRESS=${mint.toBase58()}`);

  // write everything back to the file system
  fs.writeFileSync("./.env", ENV_VARS.join(os.EOL));
}

const updateMetadata = async () => {
  try {
    const mint = new PublicKey(process.env.ADDRESS)
    const metadataPDA = await findMetadataPda(mint);
    const tokenMetadata = {
      name: "", 
      symbol: "",
      uri: "",
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null
    };
    const updateMetadataTransaction = new Transaction().add(
      createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataPDA,
          mint,
          mintAuthority: wallet.publicKey,
          payer: wallet.publicKey,
          updateAuthority: wallet.publicKey
        },
        {
          createMetadataAccountArgsV3: {
            data: tokenMetadata,
            collectionDetails: null,
            isMutable: true,
          },
        }
      )
    );
    await sendTransaction(updateMetadataTransaction, [])
  } catch(e) {
    console.log(e)
  }
}

async function sendTransaction(transaction , signers) {
  transaction.feePayer = wallet.publicKey
  transaction.recentBlockhash = (await connection.getRecentBlockhash('max')).blockhash;
  await transaction.setSigners(wallet.publicKey,...signers.map(s => s.publicKey));
  if(signers.length != 0) await transaction.partialSign(...signers)
  // const signedTransaction = await wallet.signTransaction(transaction)
  var signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet]
  );
  console.log("SIGNATURE", signature);

  console.log("SUCCESS");
  return signature;
}


program.command("create_token")
  .action(async (directory, cmd) => {
    try {
      await createToken()
    } catch (err) {
      console.log(err);
    }
});

program.command("update_metadata")
  .action(async (directory, cmd) => {
    try {
      await updateMetadata()
    } catch (err) {
      console.log(err);
    }
});

program.command("add_supply")
.requiredOption("-a, --amount <string>", "add amount")
  .action(async (directory, cmd) => {
    const { amount } = cmd.opts();
    const mint = new PublicKey(process.env.ADDRESS)
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      mint,
      wallet.publicKey
    )
    await mintTo(
      connection,
      wallet,
      mint,
      tokenAccount.address,
      wallet,
      amount * 10 ** 9// because decimals for the mint are set to 9 
    )
  });

program.parse(process.argv);
