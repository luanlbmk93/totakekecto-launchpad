Para fazer o deploy pelo Hardhat:

1. Configurar o .env
Na raiz do projeto, crie o arquivo .env (ou copie de .env.example):

PRIVATE_KEY=0x+sua_chave_privada_64_caracteres
BSCSCAN_API_KEY=sua_api_key_do_bscscan
PRIVATE_KEY: chave da carteira que fará o deploy (precisa ter BNB para gas)
BSCSCAN_API_KEY: pegue em https://bscscan.com/myapikey (serve para verificação dos contratos)
2. Compilar os contratos
npm run compile
3. Rodar o deploy
BSC Mainnet:

npm run deploy:bsc
BSC Testnet:

npm run deploy:testnet
Ou direto com o Hardhat:

npx hardhat run contracts/deploy-full.js --network bsc
para mainnet, e

npx hardhat run contracts/deploy-full.js --network bnb_testnet
para testnet.

4. Atualizar o frontend
Depois do deploy, copie o endereço do TokenFactory que aparecer no terminal e coloque em src/contracts/contractAddresses.ts:

export const CONTRACT_ADDRESSES = {
  TOKEN_FACTORY: '0x...endereco_que_apareceu_no_terminal',
};
O script deploy-full.js já faz o deploy do BurnAgent, do TokenFactory e configura ambos automaticamente.