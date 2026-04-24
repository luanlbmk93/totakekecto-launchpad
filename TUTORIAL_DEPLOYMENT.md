# Tota Vault — Tutorial de Deploy e Produção

Passo a passo para deploy, configuração e colocação em produção global.

---

## PARTE 1 — Valores Configuráveis (Onde Mudar Cada Um)

### 1.1 Contratos Solidity (`contracts/TokenFactory.sol`)

| Valor | Arquivo | Linha aprox. | Teste (mainnet barato) | Produção sugerida |
|-------|---------|--------------|------------------------|-------------------|
| **ECOSYSTEM_FEE** | TokenFactory.sol | 68 | 100 (1%) | 100 (1%) |
| **CREATOR_FEE** | TokenFactory.sol | 69 | 50 (0.5%) | 50–100 (0.5–1%) |
| **BURNAGENT_FEE** | TokenFactory.sol | 70 | 50 (0.5%) | 50 (0.5%) |
| **CREATION_MIN_FEE** | TokenFactory.sol | 72 | 0.0001 ether | 0.003 ether |
| **CTO min first buy** (`minCtoFirstBuyWei`) | TokenFactory.sol |  | 0.0001 ether | 0.6 ether |
| **GRADUATION_TARGET** | TokenFactory.sol | 74 | 0.1 ether | 1 ether |
| **virtualETH** (curva) | TokenFactory.sol | 216 | 30 ether | 30 ether |

**Onde editar:**

```solidity
// contracts/TokenFactory.sol

uint256 public constant ECOSYSTEM_FEE = 100;      // bps (100 = 1%)
uint256 public constant CREATOR_FEE   = 50;       // bps (50 = 0.5%)
uint256 public constant BURNAGENT_FEE = 50;       // bps

uint256 public constant CREATION_MIN_FEE = 0.0001 ether;        // Taxa criação
// CTO-only build: creator first buy must be locked + meet minCtoFirstBuyWei
uint256 public constant GRADUATION_TARGET = 0.1 ether;          // Meta para graduar

// Curva de bonding (linha ~216)
virtualETH: 30 ether,
```

### 1.2 Frontend / JavaScript

| Valor | Arquivo | Linha aprox. | O que mudar |
|-------|---------|--------------|-------------|
| **Creation fee (UI)** | CreateTokenForm.tsx |  | `creationFee = 0.003` |
| **CTO first buy (UI)** | CreateTokenForm.tsx |  | `firstBuyBnb = 0.6` (locked) |
| **Creation fee (cálculo)** | useContracts.ts |  | `parseEther('0.003')` |
| **CTO min first buy (cálculo)** | useContracts.ts |  | lê `minCtoFirstBuyWei()` (fallback `0.6`) |
| **TOKEN_FACTORY address** | contractAddresses.ts | 3 | Endereço após deploy |
| **FAQ creation cost** | FAQ.tsx |  | "0.003 BNB" |
| **FAQ graduation** | FAQ.tsx | 24 | "0.0001 BNB" → "1 BNB" |
| **Whitepaper fee** | Whitepaper.tsx | 290 | "0.003 BNB" |

---

## PARTE 2 — Rede e Configuração

### 2.1 Hardhat (`hardhat.config.js`)

O `hardhat.config.js` já inclui BSC Testnet e Mainnet. Verifique se está correto.

### 2.2 Variáveis de ambiente (`.env`)

Crie `.env` na raiz:

```
PRIVATE_KEY=0x...sua_chave_privada...
BSCSCAN_API_KEY=sua_api_key_bscscan
BSC_MAINNET_URL=https://bsc-dataseed.binance.org/
BSC_TESTNET_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
```

- **PRIVATE_KEY**: carteira que fará o deploy (com BNB para gas).
- **BSCSCAN_API_KEY**: gere em https://bscscan.com/myapikey.

---

## PARTE 3 — Deploy Etapa por Etapa

> **Nota:** O TokenFactory usa endereços do PancakeSwap **mainnet** (UNIV2_FACTORY_BASE, UNIV2_ROUTER_BASE). Em testnet, a graduação para DEX pode falhar. Para testes baratos em mainnet, use os valores baixos abaixo.

### Etapa 1 — Valores para teste (mainnet barato)

Antes de rodar o deploy, use valores baixos para economizar:

**`contracts/TokenFactory.sol`:**
- `CREATION_MIN_FEE = 0.0001 ether`
- `minCtoFirstBuyWei` (via `setMinCtoFirstBuyWei`) para CTO-only
- `GRADUATION_TARGET = 0.1 ether`

**`src/hooks/useContracts.ts`:**
- Linha 95: `parseEther('0.0001')`
- Linha 148: `parseEther('0.0001')`

**`src/components/CreateTokenForm.tsx`:**
- Linha 105: `creationFee = 0.0001`
- Linha 163: texto "Min: 0.0001 BNB"
- Linha 35: `firstBuyBnb: '0.0001'`

### Etapa 2 — Compilar

```bash
npm run compile
```

### Etapa 3 — Deploy (BurnAgent + TokenFactory)

O script `deploy-full.js` faz tudo em sequência: BurnAgent → TokenFactory → `setBurnAgent` → `setPlatformToken`.

**Testnet:**
```bash
npm run deploy:testnet
```

**Mainnet:**
```bash
npm run deploy:bsc
```

O script mostra os endereços ao final. Por padrão, usa CAKE (mainnet) ou DAI testnet como token de burn. Para outro token: `PLATFORM_TOKEN=0x... npm run deploy:bsc`

Copie o endereço do **TokenFactory** para o próximo passo.

### Etapa 4 — Atualizar o frontend

Edite `src/contracts/contractAddresses.ts`:

```typescript
export const CONTRACT_ADDRESSES = {
  TOKEN_FACTORY: '0x...',  // Endereço do TokenFactory
};
```

### Etapa 5 — Verificar contratos no BSCScan

```bash
npx hardhat verify --network bsc 0x_TOKEN_FACTORY_ADDRESS
npx hardhat verify --network bsc 0x_BURN_AGENT_ADDRESS 0x10ED43C718714eb63d5aA57B78B54704E256024E
```

### Etapa 6 — `VITE_FACTORY_DEPLOY_BLOCK` (opcional, para charts)

Se quiser que o gráfico comece do bloco do deploy:

1. Pegue o número do bloco do deploy no BSCScan.
2. Crie `.env` na raiz (ou `.env.local`):
   ```
   VITE_FACTORY_DEPLOY_BLOCK=12345678
   ```
3. Rebuild: `npm run build`

---

## PARTE 4 — Produção Global

### 4.1 Valores de produção nos contratos

Restaure valores mais seguros/atrativos:

**`contracts/TokenFactory.sol`:**
```solidity
uint256 public constant CREATION_MIN_FEE = 0.003 ether;
// CTO-only build: set minCtoFirstBuyWei = 0.6 ether (default) or adjust via owner function
uint256 public constant GRADUATION_TARGET = 1 ether;
```

Recompile e faça um novo deploy (novo endereço de contrato) ou deixe os testes com valores baixos até validar tudo.

### 4.2 Valores de produção no frontend

- `CreateTokenForm.tsx`: `creationFee = 0.003` e `firstBuyBnb = 0.6` (CTO locked)
- `useContracts.ts`: `parseEther('0.003')` e valida `minCtoFirstBuyWei()`
- `FAQ.tsx` e `Whitepaper.tsx`: textos com 0.003 BNB

### 4.3 RPC e APIs

Para produção com mais estabilidade:

- **RPC**: considere um provedor dedicado (Alchemy, QuickNode, Ankr) em vez do RPC público.
- Troque em:
  - `src/hooks/useContracts.ts` → `BSC_RPC_URL`
  - `src/hooks/useFactoryEvents.ts` → `BSC_RPC_URL`
  - `src/hooks/useGlobalTrades.ts` → `BSC_RPC`
  - `src/components/PriceChart.tsx` → `BSC_RPC_URL`
  - `src/hooks/useRocketBoost.ts` → `BSC_RPC_URL`

Exemplo com env:
```
VITE_BSC_RPC_URL=https://bsc-mainnet.g.alchemy.com/v2/SEU_KEY
```

E no código:
```javascript
const BSC_RPC_URL = import.meta.env?.VITE_BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
```

### 4.4 Deploy do frontend

**Vercel / Netlify / similar:**
1. Conecte o repositório
2. Build command: `npm run build`
3. Output: `dist`
4. Variáveis de ambiente: `VITE_FACTORY_DEPLOY_BLOCK`, `VITE_BSC_RPC_URL` (se usar)

### 4.5 Domínio e HTTPS

- Configure um domínio no provedor de hospedagem.
- Use HTTPS (geralmente automático em Vercel/Netlify).

### 4.6 WalletConnect / AppKit

- `src/App.tsx` usa `projectId` do Reown/WalletConnect.
- Crie um projeto em https://cloud.reown.com e substitua o `projectId`.
- Atualize `metadata` (nome, descrição, ícones, URL).

---

## PARTE 5 — Checklist Final

- [ ] `.env` configurado (PRIVATE_KEY, BSCSCAN_API_KEY)
- [ ] Valores de teste ou produção definidos em TokenFactory.sol
- [ ] Valores do frontend alinhados (creation fee, min first buy)
- [ ] BurnAgent deployado
- [ ] TokenFactory deployado
- [ ] `setBurnAgent` chamado no TokenFactory
- [ ] `setPlatformToken` chamado no BurnAgent
- [ ] `contractAddresses.ts` atualizado
- [ ] Contratos verificados no BSCScan
- [ ] `VITE_FACTORY_DEPLOY_BLOCK` configurado (opcional)
- [ ] Frontend em build sem erros
- [ ] Deploy do frontend em Vercel/Netlify
- [ ] Domínio e HTTPS
- [ ] Reown AppKit configurado com projeto próprio

---

## Referência rápida — arquivos por valor

| O que | Onde |
|-------|------|
| Taxa de criação | TokenFactory.sol (72), useContracts.ts (95), CreateTokenForm.tsx (105) |
| Mín. primeira compra | TokenFactory.sol (73), useContracts.ts (148), CreateTokenForm.tsx (163) |
| Meta de graduação | TokenFactory.sol (74) |
| Taxas de trade | TokenFactory.sol (68–70) |
| Endereço do factory | contractAddresses.ts (3) |
| RPC BSC | useContracts, useFactoryEvents, useGlobalTrades, PriceChart, useRocketBoost |
