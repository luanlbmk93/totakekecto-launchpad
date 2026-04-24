O que já existe
hardhat.config.cjs: plugin de verify com BSCSCAN_API_KEY para bsc e bscTestnet.
contracts/deploy-full.cjs: após deploy, mostra algo como:
  console.log("\nVerify contracts:");
  console.log(`  npx hardhat verify --network ${net} ${burnAgentAddr} ${addrs.router}`);
  console.log(`  npx hardhat verify --network ${net} ${factoryAddr}`);
TokenFactory: construtor sem argumentos → só endereço.
BurnAgent: construtor (address _router) → tens de passar o router (o script já usa o mesmo router do deploy).
2. Como verificar na prática
No .env (ou ambiente):

BSCSCAN_API_KEY — BscScan → API Keys (testnet: testnet.bscscan.com).
Testnet (exemplo rede bnb_testnet):

npx hardhat verify --network bnb_testnet <BURN_AGENT> 0xD99D1c33F9fC3444f8101754aBC46c52416550D1
npx hardhat verify --network bnb_testnet <TOKEN_FACTORY>
Mainnet (bsc):

npx hardhat verify --network bsc <BURN_AGENT> 0x10ED43C718714eb63d5aA57B78B54704E256024E
npx hardhat verify --network bsc <TOKEN_FACTORY>
Substitui <BURN_AGENT> e <TOKEN_FACTORY> pelos endereços que o deploy imprimiu.

3. Tokens (MemeCoin) criados pela factory
O MemeCoin tem construtor (string name, string symbol, address factory) — tens de passar os três na verificação, iguais ao deploy:

npx hardhat verify --network bsc <ENDEREÇO_DO_TOKEN> "Nome" "SYMBOL" <ENDEREÇO_TOKEN_FACTORY>
Se o nome tiver espaços ou caracteres especiais, no PowerShell podes precisar de aspas como acima.

4. “Verificação automática de todos os contratos”
Hoje não está implementado. Para aproximar disso podes:

No fim do deploy-full.cjs: chamar hre.run("verify:verify", { address, constructorArguments: [...] }) para BurnAgent e TokenFactory (com try/catch porque às vezes o explorer ainda não indexou).
Ao criar token na UI: após createToken, um script/backend que chame verify com (name, symbol, factory) — ou fazeres manualmente por token.



npx hardhat verify --network bsc