const Web3 = require('web3');
const fs = require('fs');

// RINKEBY
const INFURA_RINKEBY_KEY="39f6b87b938e4c6bb51e8691c17c0492";
const INFURA_RINKEBY_URL=`https://rinkeby.infura.io/v3/${INFURA_RINKEBY_KEY}`;
const RINKEBY_PRIV_KEY="e2d89af38048ad31b67c9d98ae68dab7e1b83ca0b70976755f3fd7a043c375aa";
const RINKEBY_CONTRACT_ADDR="0xeDF584a3244859B848dd87941069bf42367a57eB";

// MAINNET
////////////////////////////////

const CONTRACT_ABI = require("./abi.json");
const ETHER_TRANSFER_GAS = 21000;

const WEB3 = new Web3(INFURA_RINKEBY_URL);
const CONTRACT = new WEB3.eth.Contract(CONTRACT_ABI, RINKEBY_CONTRACT_ADDR);
const BN = WEB3.utils.BN;

var STREAM = fs.createWriteStream(`${new Date().toISOString()}.txt`, {flags: 'a'});

function importMainWallet(mainWalletSk) {
    return WEB3.eth.accounts.wallet.add(mainWalletSk);
}

function importWalletsFromFile(filepath) {
    const data = fs.readFileSync(filepath, "utf8");
    const rows = data.split(/\r?\n/);

    const wallets = rows.map(row => {
        return WEB3.eth.accounts.wallet.add(row);
    });

    return wallets;
}

// async function createWallet() {
//     const wallets = WEB3.eth.accounts.wallet.create(1);

//     return wallets[wallets.length - 1];
// }

async function getNftPrice() {
    // const isWhitelisted = await CONTRACT.methods._whitelisted(address).call();
    // var price;
    // if (isWhitelisted) {
    //     price = await CONTRACT.methods.whitelistPrice().call();
    // } else {
    //     price = await CONTRACT.methods.salePrice().call();
    // }

    const price = await CONTRACT.methods.salePrice().call();

    return price;
}

async function estimateMintGas(addrFrom, amount) {
    const price = await getNftPrice(addrFrom);
    const cost = new BN(price).mul(new BN(amount)).toString();
    const estimatedGas = await CONTRACT.methods.publicMint(amount).estimateGas({
        from: addrFrom, 
        value: cost
    });

    return estimatedGas;
}

async function mintNft(walletMintFrom, amount) {
    const addrFrom = walletMintFrom.address;
    console.log(`Minting ${amount} NFTS from address ${addrFrom}`);

    const price = await getNftPrice(addrFrom);
    const cost = new BN(price).mul(new BN(amount)).toString();

    const gasPrice = await WEB3.eth.getGasPrice();
    const gasLimit = await estimateMintGas(addrFrom, amount);

    try {
        const res = await CONTRACT.methods.publicMint(amount).send({
            from: addrFrom, 
            value: cost,
            gasPrice: gasPrice,
            gas: gasLimit
        });
    } catch (err) {
        console.log(`Mint failed from ${addrFrom}!`);
        throw err;
    }

    console.log(`Minted ${amount} NFTS for address ${addrFrom}`);

    const fee = new BN(gasLimit).mul(new BN(gasPrice)).toString();
    STREAM.write(`${walletMintFrom.address} ${walletMintFrom.privateKey} ${amount} ${fee}\n`);
}

async function transferEther(receiver, sender) {
    const balance = await WEB3.eth.getBalance(sender);

    const gasPrice = await WEB3.eth.getGasPrice();

    const fee = new BN(ETHER_TRANSFER_GAS).mul(new BN(gasPrice));

    if (new BN(balance).lte(fee)) {
        return;
    }

    const value = new BN(balance).sub(fee).toString();

    await WEB3.eth.sendTransaction({
        to: receiver, 
        from: sender, 
        value: value, 
        gas: ETHER_TRANSFER_GAS,
        gasPrice: gasPrice
    });

    console.log(`Transfered ${value.toString()} wei from ${sender} to ${receiver}`);
}

async function returnEther(wallets) {
    if (wallets.length == 0) return;

    const txPromises = [];

    for (let i = 1; i < wallets.length; i++) {
        txPromises.push(
            transferEther(wallets[0].address, wallets[i].address)
        );
    }

    await Promise.allSettled(txPromises);
}

async function main(inputFilepath, accountsNum, amountNfts) {
    const wallets = importWalletsFromFile(inputFilepath);
    const mainWallet = wallets[0];
    const balanceMainWallet = await WEB3.eth.getBalance(mainWallet.address);

    console.log(`Balance of ${mainWallet.address} is ${balanceMainWallet} wei`);
    
    await mintNft(mainWallet, amountNfts);

    try {
        for (let i = 1; i < accountsNum; i++) {
            await transferEther(wallets[i].address, wallets[i-1].address);
            await mintNft(wallets[i], amountNfts);
        }
    } catch(err) {
        console.log(err);
    }

    // await returnEther(wallets);
}

main('input_example.txt', 3, 1)
    .then(() => {
        console.log("Finished!");
    })
    .catch(err => {
        console.log(err);
    })