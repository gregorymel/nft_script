const Web3 = require('web3');
const fs = require('fs');

// RINKEBY
const INFURA_RINKEBY_KEY="39f6b87b938e4c6bb51e8691c17c0492";
const INFURA_RINKEBY_URL=`https://rinkeby.infura.io/v3/${INFURA_RINKEBY_KEY}`;
const RINKEBY_PRIV_KEY="9c16c6dd5898261e89bcd8de79be9510a482298b24d27b5634f3bd6d6cdfec21";
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
    WEB3.eth.accounts.wallet.add(mainWalletSk);
}

async function createWallet() {
    const wallets = WEB3.eth.accounts.wallet.create(1);


    await transferEther(
        wallets[wallets.length - 1].address,
        wallets[wallets.length - 2].address
    );

    return wallets[wallets.length - 1];
}

async function getNftPrice(address) {
    const isWhitelisted = await CONTRACT.methods._whitelisted(address).call();
    var price;
    if (isWhitelisted) {
        price = await CONTRACT.methods.whitelistPrice().call();
    } else {
        price = await CONTRACT.methods.salePrice().call();
    }

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

async function mintNft(walletFrom, amount) {
    const addrFrom = walletFrom.address;
    console.log(`Minting ${amount} NFTS from address ${addrFrom}`);

    const gasLimit = await estimateMintGas(addrFrom, amount);
    const gasPrice = await WEB3.eth.getGasPrice();
    
    const price = await getNftPrice(addrFrom);
    const cost = new BN(price).mul(new BN(amount)).toString();

    const res = await CONTRACT.methods.publicMint(amount).send({
        from: addrFrom, 
        value: cost,
        gasPrice: gasPrice,
        gas: gasLimit
    });

    console.log(`Minted ${amount} NFTS for address ${addrFrom}`);

    const fee = new BN(gasLimit).mul(new BN(gasPrice)).toString();
    STREAM.write(`${walletFrom.address} ${walletFrom.privateKey} ${amount} ${fee}\n`);
}

async function transferEther(receiver, sender) {
    const balance = await WEB3.eth.getBalance(sender);

    const gasPrice = await WEB3.eth.getGasPrice();

    const value = new BN(balance).sub(
        new BN(ETHER_TRANSFER_GAS).mul(new BN(gasPrice))
    );

    await WEB3.eth.sendTransaction({
        to: receiver, 
        from: sender, 
        value: value, 
        gas: ETHER_TRANSFER_GAS,
        gasPrice: gasPrice
    });
}

async function main(mainWalletSk, accountsNum, amountNfts) {
    const amount = 1;
    
    importMainWallet(mainWalletSk);
    const mainWallet = WEB3.eth.accounts.wallet[0];
    

    await mintNft(mainWallet, amountNfts);

    try {
        for (let i = 0; i < accountsNum - 1; i++) {
            const wallet = await createWallet();
            await mintNft(wallet, amountNfts);
        }
    } catch(err) {
        console.log(err);
    }

    const length = WEB3.eth.accounts.wallet.length;
    const wallet = WEB3.eth.accounts.wallet[length - 1];
    await transferEther(mainWallet.address, wallet.address);
}

main(RINKEBY_PRIV_KEY, 3, 1)
    .then(() => {
        console.log("Finished!");
    })
    .catch(err => {
        console.log(err);
    })
