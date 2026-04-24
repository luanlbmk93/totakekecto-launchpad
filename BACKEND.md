# Backend (API) + frontend no PC — e VPS depois

## Passo a passo (começar do zero)

1. **Instala dependências** (uma vez, na pasta do projeto): abre PowerShell na raiz da pasta `BASE2MEME_V1_DAPP-main` e corre:
   ```powershell
   npm install
   ```

2. **Cria ou edita o ficheiro `.env`** na **mesma pasta** onde está o `package.json` (raiz do projeto). Tem de existir esta linha (podes copiar de `.env.example`):
   ```env
   VITE_API_URL=http://127.0.0.1:8787
   ```
   Guarda o ficheiro.

3. **Abre o 1.º terminal** (PowerShell), vai à pasta do projeto e **sobe só a API**:
   ```powershell
   cd C:\Users\Luan Biagioni\Desktop\BASE2MEME_V1_DAPP-main
   npm run server
   ```
   Deixa este terminal **aberto**. Deves ver algo como `listening` na porta **8787**.  
   Se der erro de porta ocupada, fecha outro `npm run server` antigo ou reinicia o PC.

4. **Testa se a API responde:** abre o Chrome/Edge e vai a:
   ```
   http://127.0.0.1:8787/health
   ```
   Deves ver JSON com `"ok": true`. Se não abrir, o passo 3 não está certo.

5. **Abre um 2.º terminal** (novo separador ou nova janela), vai outra vez à pasta do projeto e **sobe o site** (Vite):
   ```powershell
   cd C:\Users\Luan Biagioni\Desktop\BASE2MEME_V1_DAPP-main
   npm run dev
   ```
   O terminal mostra um endereço (normalmente `http://localhost:5173`). Clica ou abre no browser.

6. **Se mudaste o `.env`** depois de já teres aberto o `npm run dev`: para o Vite (`Ctrl+C` no 2.º terminal) e corre `npm run dev` de novo. O Vite só lê o `.env` ao arrancar.

7. **O que fica onde:** no 1.º terminal corre **só o backend**. No 2.º corre **só o frontend**. Os dois têm de estar ligados ao mesmo tempo enquanto desenvolves.

8. **Mais tarde na VPS:** a mesma API (`server/`), mas na máquina Linux com `BIND_HOST=0.0.0.0` e Nginx à frente — vê a secção “VPS” mais abaixo.

---

## O que é o quê

| Pasta | Função |
|--------|--------|
| **`server/`** | API Node (Express): `/api/tokens`, `/api/trades/:token`, `/api/rocket/...` |
| **`src/`** | Frontend React (Vite). No browser **não** deve ir dezenas de pedidos à RPC — por isso existe a API. |

O ficheiro **`.env`** na raiz é lido pelo **Vite** (só linhas `VITE_*`) e pelo **Node** se correres a API com `dotenv` (variáveis **sem** `VITE_` para BSC, factory, etc.).

---

## 1) Desenvolvimento no teu PC (fluxo normal)

**Terminal 1 — API**

```powershell
cd caminho\para\BASE2MEME_V1_DAPP-main
npm run server
```

Fica à escuta na porta **8787** (ou o que `PORT` disser).

**Terminal 2 — site**

```powershell
npm run dev
```

**`.env` (na raiz do projeto)** — o browser precisa disto para falar com a API local:

```env
VITE_API_URL=http://127.0.0.1:8787
```

Reinicia o `npm run dev` sempre que mudares `VITE_*`.

**Teste rápido:** abre no browser `http://127.0.0.1:8787/health` — deve responder JSON com `"ok": true`.

---

## 2) Quem lê o quê (variáveis)

### Frontend (Vite) — só `VITE_*`

- **`VITE_API_URL`** — URL da API (no PC: `http://127.0.0.1:8787`; na VPS: `https://api.teudominio.com`).
- **`VITE_BSC_RPC_URL`** — RPC BSC para o que ainda corre no cliente (charts, wallet, etc.).
- **`VITE_ETHERSCAN_API_KEY`** — explorer, se usares no cliente.

### API Node (`npm run server`) — **sem** prefixo `VITE_`

Podes pôr no **mesmo `.env`** na raiz (o `dotenv` no servidor carrega da raiz quando corres `npm run server` a partir dela):

| Variável | Exemplo |
|----------|---------|
| **`ETHERSCAN_API_KEY`** ou **`VITE_ETHERSCAN_API_KEY`** | **Recomendado:** chave Etherscan API V2 — a API usa **HTTP** para trades em vez de `eth_getLogs` em massa (evita **rate limit** no RPC). |
| `BSC_RPC_URL` | Endpoint BSC — **podes usar [Alchemy BSC](https://dashboard.alchemy.com)** (`https://bnb-mainnet.g.alchemy.com/v2/<key>`); costuma aguentar mais `eth_getLogs` que RPC público. Mete o **mesmo URL** em `VITE_BSC_RPC_URL` no frontend. |
| `TOKEN_FACTORY` | Endereço da factory na BSC |
| `ROCKET_BOOST_ADDRESS` | Contrato Rocket |
| `PORT` | `8787` (default) |
| `FACTORY_DEPLOY_BLOCK` | Opcional — início do scan de logs |
| `FACTORY_LOG_LOOKBACK_BLOCKS` | Opcional — janela se não houver deploy block |
| `RPC_LOG_LOOKBACK_DEFAULT` | Só fallback RPC — default `400000` blocos |
| `ETH_GETLOGS_SLEEP_MS` | Pausa entre chunks RPC (default 350 ms) |

O ABI está em **`server/tokenFactory.abi.json`** (não precisas de `artifacts/` para a API).

---

## 3) Bind de rede (PC vs VPS)

- **No PC:** por defeito a API escuta em **`127.0.0.1`** — só a tua máquina acede; é o mais seguro para dev.
- **Na VPS:** o processo tem de aceitar tráfego externo. Define:

```env
BIND_HOST=0.0.0.0
PORT=8787
```

Ou só `BIND_HOST=0.0.0.0`. Sem isto, o Nginx/Caddy à frente não consegue falar com o Node.

---

## 4) VPS (quando fores para lá)

Ordem lógica:

1. **Máquina Linux** com Node 20+.
2. Copia o projeto (ou só a pasta **`server/`** + `package.json` da raiz se fizeres deploy minimalista — o script `npm run publish:backend` gera uma pasta só com o backend).
3. Na VPS: `cd server && npm install && npm start` (ou `node index.mjs` com `package.json` do `server/`).
4. **Systemd** ou **PM2** para manter o processo vivo.
5. **Nginx** ou **Caddy**: HTTPS público → `proxy_pass http://127.0.0.1:8787`.
6. Firewall: abrir **80/443** (não expor a porta do Node diretamente se puderes evitar).
7. No **teu PC**, no `.env` do frontend em build/dev:  
   `VITE_API_URL=https://api.teudominio.com`

CORS na API já está `origin: true` — para produção podes restringir depois.

---

## 5) Repo Git só com o backend (opcional)

Se quiseres um repositório **só** para a API (por exemplo para clonar só isso na VPS):

```powershell
npm run publish:backend
```

Gera uma pasta ao lado do projeto (ex.: `vault-api-backend-only`) com `git init`. Depois fazes `remote` e `push` para o teu GitHub. **Isto é opcional** — podes também dar `git clone` do repo inteiro na VPS e correr só `server/`.

---

## 6) Comandos úteis

| Comando | O quê |
|---------|--------|
| `npm run server` | Sobe a API (raiz do projeto) |
| `cd server && npm start` | Só se estiveres a usar o `package.json` **dentro** de `server/` (ex.: pasta publicada sozinha) |
| `npm run export:abi` | Atualiza `server/tokenFactory.abi.json` depois de `npx hardhat compile` |

---

Tudo o que era específico de **Render** foi removido deste fluxo; numa VPS és tu que corres o mesmo Node, com `BIND_HOST=0.0.0.0` e reverse proxy.
